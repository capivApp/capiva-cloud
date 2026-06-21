import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useGitConnections } from "@/hooks/useGitConnections";

export interface GitEditing {
  id: string;
  provider: string;
  accountLogin: string | null;
}

export function GitConnectionDrawer({ open, onClose, editing, onSaved }: { open: boolean; onClose: () => void; editing?: GitEditing | null; onSaved: () => void }) {
  const { create, update, isCreating } = useGitConnections();
  const [f, setF] = useState({ provider: "GITHUB", accessToken: "", accountLogin: "" });

  useEffect(() => {
    if (open) setF({ provider: editing?.provider ?? "GITHUB", accessToken: "", accountLogin: editing?.accountLogin ?? "" });
  }, [open, editing]);

  async function submit() {
    if (!editing && !f.accessToken) return toast.error("Informe o token de acesso.");
    try {
      if (editing) await update({ id: editing.id, patch: { accessToken: f.accessToken || undefined, accountLogin: f.accountLogin || undefined } });
      else await create(f);
      toast.success(editing ? "Conexão atualizada" : "Conexão Git criada");
      onSaved();
      onClose();
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <Drawer open={open} onClose={onClose} title={editing ? "Editar conexão Git" : "Conectar provedor Git"} footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="gradient" onClick={submit} disabled={isCreating}>{editing ? "Salvar" : "Conectar"}</Button></div>}>
      <div className="space-y-3">
        <div className="space-y-1.5"><Label>Provedor</Label><select disabled={Boolean(editing)} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm disabled:opacity-60" value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value })}><option>GITHUB</option><option>GITLAB</option><option>GITEA</option></select></div>
        <div className="space-y-1.5"><Label>Conta (login, opcional)</Label><Input value={f.accountLogin} onChange={(e) => setF({ ...f, accountLogin: e.target.value })} placeholder="org-ou-usuario" /></div>
        <div className="space-y-1.5"><Label>Access token{editing && " (vazio = manter)"}</Label><Input type="password" value={f.accessToken} onChange={(e) => setF({ ...f, accessToken: e.target.value })} placeholder="ghp_..." /></div>
      </div>
    </Drawer>
  );
}
