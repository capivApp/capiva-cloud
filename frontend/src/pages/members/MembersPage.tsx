import { Copy, Mail, Trash2, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Drawer } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMembers, type Role } from "@/hooks/useMembers";

const ROLES: Role[] = ["OWNER", "ADMIN", "DEVELOPER", "VIEWER"];

/** Página de Usuários: membros, papéis (RBAC) e convites por email. */
export function MembersPage() {
  const { members, invitations, isLoading, invite, isInviting, revoke, changeRole, remove } = useMembers();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ email: string; role: Role }>({ email: "", role: "DEVELOPER" });
  const [lastToken, setLastToken] = useState<string | null>(null);

  const guard = (fn: () => Promise<unknown>, ok: string) => fn().then(() => toast.success(ok)).catch((e) => toast.error((e as Error).message));

  const submit = async () => {
    if (!form.email.includes("@")) return toast.error("Email inválido.");
    try {
      const inv = await invite(form);
      setLastToken(inv.token ?? null);
      setForm({ email: "", role: "DEVELOPER" });
      toast.success("Convite criado.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const inviteLink = (token: string) => `${window.location.origin}/login?invite=${token}`;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Usuários</h1>
          <p className="text-sm text-muted-foreground">Membros, papéis (RBAC) e convites da organização.</p>
        </div>
        <Button variant="gradient" onClick={() => { setLastToken(null); setOpen(true); }}><UserPlus className="size-4" /> Convidar</Button>
      </div>

      <Card>
        <CardContent className="space-y-3 pt-5">
          {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {members.map((m) => (
            <div key={m.userId} className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5 text-sm">
              <div>
                <p className="font-medium">{m.name}</p>
                <p className="text-xs text-muted-foreground">{m.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <select className="rounded-md border border-border bg-background px-2 py-1 text-xs" value={m.role}
                  onChange={(e) => guard(() => changeRole({ userId: m.userId, role: e.target.value as Role }), "Papel atualizado")}>
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <Button variant="ghost" size="icon" onClick={() => guard(() => remove(m.userId), "Membro removido")}><Trash2 className="size-4" /></Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {invitations.length > 0 && (
        <Card>
          <CardContent className="space-y-3 pt-5">
            <p className="text-sm font-medium">Convites pendentes</p>
            {invitations.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                <span className="inline-flex items-center gap-2"><Mail className="size-4 text-muted-foreground" /> {inv.email}</span>
                <div className="flex items-center gap-2">
                  <Badge variant="muted">{inv.role}</Badge>
                  <Button variant="ghost" size="icon" onClick={() => guard(() => revoke(inv.id), "Convite revogado")}><Trash2 className="size-4" /></Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Drawer open={open} onClose={() => setOpen(false)} title="Convidar usuário" description="Cria um convite com um papel. Compartilhe o link gerado."
        footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setOpen(false)}>Fechar</Button><Button variant="gradient" onClick={submit} disabled={isInviting}>Convidar</Button></div>}>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="pessoa@empresa.com" /></div>
          <div className="space-y-1.5">
            <Label>Papel</Label>
            <select className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              {ROLES.filter((r) => r !== "OWNER").map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          {lastToken && (
            <div className="space-y-1.5 rounded-lg border border-success/40 bg-success/5 p-3">
              <Label className="text-xs">Link de convite (mostrado uma vez)</Label>
              <div className="flex items-center gap-2">
                <Input readOnly className="font-mono text-xs" value={inviteLink(lastToken)} />
                <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(inviteLink(lastToken)); toast.success("Copiado"); }}><Copy className="size-4" /></Button>
              </div>
            </div>
          )}
        </div>
      </Drawer>
    </div>
  );
}
