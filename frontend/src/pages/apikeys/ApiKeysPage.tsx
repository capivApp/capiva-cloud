import { Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Drawer } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApiKeys } from "@/hooks/useApiKeys";
import type { Role } from "@/hooks/useMembers";

const ROLES: Role[] = ["ADMIN", "DEVELOPER", "VIEWER"];

/** API/CLI Keys: criar (secret mostrado 1x), listar (prefix, lastUsed), revogar. */
export function ApiKeysPage() {
  const { keys, isLoading, create, isCreating, remove } = useApiKeys();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ name: string; role: Role }>({ name: "", role: "DEVELOPER" });
  const [secret, setSecret] = useState<string | null>(null);

  const submit = async () => {
    if (!form.name.trim()) return toast.error("Informe um nome.");
    try {
      const created = await create(form);
      setSecret(created.secret ?? null);
      setForm({ name: "", role: "DEVELOPER" });
      toast.success("Chave criada.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const del = (id: string) => remove(id).then(() => toast.success("Chave revogada")).catch((e) => toast.error((e as Error).message));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">API Keys</h1>
          <p className="text-sm text-muted-foreground">Chaves para o app mobile e automações (CLI/CI).</p>
        </div>
        <Button variant="gradient" onClick={() => { setSecret(null); setOpen(true); }}><Plus className="size-4" /> Nova chave</Button>
      </div>

      <Card>
        <CardContent className="space-y-3 pt-5">
          {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {!isLoading && keys.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma chave.</p>}
          {keys.map((k) => (
            <div key={k.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5 text-sm">
              <div className="flex items-center gap-2">
                <KeyRound className="size-4 text-muted-foreground" />
                <span className="font-medium">{k.name}</span>
                <span className="font-mono text-xs text-muted-foreground">cap_{k.prefix}…</span>
                <Badge variant="muted">{k.role}</Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{k.lastUsedAt ? `usada ${new Date(k.lastUsedAt).toLocaleDateString()}` : "nunca usada"}</span>
                <Button variant="ghost" size="icon" onClick={() => del(k.id)}><Trash2 className="size-4" /></Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Drawer open={open} onClose={() => setOpen(false)} title="Nova API key" description="Defina nome e papel. A chave é mostrada uma única vez."
        footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setOpen(false)}>Fechar</Button><Button variant="gradient" onClick={submit} disabled={isCreating}>Criar</Button></div>}>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="App mobile" /></div>
          <div className="space-y-1.5">
            <Label>Papel</Label>
            <select className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          {secret && (
            <div className="space-y-1.5 rounded-lg border border-success/40 bg-success/5 p-3">
              <Label className="text-xs">Sua chave (copie agora — não será mostrada de novo)</Label>
              <div className="flex items-center gap-2">
                <Input readOnly className="font-mono text-xs" value={secret} />
                <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(secret); toast.success("Copiado"); }}><Copy className="size-4" /></Button>
              </div>
            </div>
          )}
        </div>
      </Drawer>
    </div>
  );
}
