import { HardDrive, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Drawer } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDockerRegistries } from "@/hooks/useDockerRegistries";

const blank = { name: "", url: "", username: "", password: "" };

/** Registries Docker privados (org). Gera imagePullSecret no deploy de apps privadas. */
export function RegistriesPage() {
  const { registries, isLoading, create, isCreating, remove } = useDockerRegistries();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);

  const submit = async () => {
    if (!form.name.trim() || !form.url.trim() || !form.username.trim() || !form.password) return toast.error("Preencha todos os campos.");
    try {
      await create(form);
      setForm(blank);
      setOpen(false);
      toast.success("Registry cadastrado.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Registries</h1>
          <p className="text-sm text-muted-foreground">Registries Docker privados para puxar imagens no deploy.</p>
        </div>
        <Button variant="gradient" onClick={() => setOpen(true)}><Plus className="size-4" /> Novo registry</Button>
      </div>

      <Card>
        <CardContent className="space-y-3 pt-5">
          {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {!isLoading && registries.length === 0 && <p className="text-sm text-muted-foreground">Nenhum registry cadastrado.</p>}
          {registries.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5 text-sm">
              <div className="flex items-center gap-2">
                <HardDrive className="size-4 text-muted-foreground" />
                <span className="font-medium">{r.name}</span>
                <span className="font-mono text-xs text-muted-foreground">{r.url}</span>
                <span className="text-xs text-muted-foreground">({r.username})</span>
              </div>
              <Button variant="ghost" size="icon" onClick={() => remove(r.id).then(() => toast.success("Removido")).catch((e) => toast.error((e as Error).message))}><Trash2 className="size-4" /></Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Drawer open={open} onClose={() => setOpen(false)} title="Novo registry" description="Credenciais de um registry Docker privado."
        footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button variant="gradient" onClick={submit} disabled={isCreating}>Salvar</Button></div>}>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="GHCR produção" /></div>
          <div className="space-y-1.5"><Label>URL</Label><Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="ghcr.io" /></div>
          <div className="space-y-1.5"><Label>Usuário</Label><Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="empresa" /></div>
          <div className="space-y-1.5"><Label>Senha / token</Label><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••••" /></div>
        </div>
      </Drawer>
    </div>
  );
}
