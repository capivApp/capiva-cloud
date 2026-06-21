import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useClusters } from "@/hooks/useClusters";

export interface ClusterEditing {
  id: string;
  name: string;
  region: string | null;
}

/** Drawer de criar/editar cluster — SEM YAML (URL + token + CA). */
export function ClusterDrawer({ open, onClose, editing, onSaved }: { open: boolean; onClose: () => void; editing?: ClusterEditing | null; onSaved: () => void }) {
  const { create, update, isCreating } = useClusters();
  const [f, setF] = useState({ name: "", region: "", apiUrl: "", token: "", caCert: "" });
  const set = (p: Partial<typeof f>) => setF((s) => ({ ...s, ...p }));

  useEffect(() => {
    if (open) setF({ name: editing?.name ?? "", region: editing?.region ?? "", apiUrl: "", token: "", caCert: "" });
  }, [open, editing]);

  async function submit() {
    if (!f.name) return toast.error("Informe o nome.");
    if (!editing && (!f.apiUrl || !f.token)) return toast.error("Informe URL do servidor e token.");
    try {
      if (editing) await update({ id: editing.id, patch: { name: f.name, region: f.region || undefined, apiUrl: f.apiUrl || undefined, token: f.token || undefined, caCert: f.caCert || undefined } });
      else await create({ name: f.name, region: f.region || undefined, apiUrl: f.apiUrl, token: f.token, caCert: f.caCert || undefined });
      toast.success(editing ? "Cluster atualizado" : "Cluster conectado");
      onSaved();
      onClose();
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <Drawer open={open} onClose={onClose} title={editing ? "Editar cluster" : "Conectar cluster"} description="Sem YAML: informe o endereço do cluster e um token de acesso." width="max-w-lg" footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="gradient" onClick={submit} disabled={isCreating}>{editing ? "Salvar" : "Conectar"}</Button></div>}>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Nome</Label><Input value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="prod-eu" /></div>
          <div className="space-y-1.5"><Label>Região</Label><Input value={f.region} onChange={(e) => set({ region: e.target.value })} placeholder="eu-west-1" /></div>
        </div>
        <div className="space-y-1.5"><Label>Endereço do servidor (API URL){editing && " (vazio = manter)"}</Label><Input value={f.apiUrl} onChange={(e) => set({ apiUrl: e.target.value })} placeholder="https://10.0.0.1:6443" /></div>
        <div className="space-y-1.5"><Label>Token de acesso{editing && " (vazio = manter)"}</Label><Input type="password" value={f.token} onChange={(e) => set({ token: e.target.value })} placeholder="eyJhbGc..." /></div>
        <div className="space-y-1.5"><Label>Certificado CA (opcional)</Label><Input value={f.caCert} onChange={(e) => set({ caCert: e.target.value })} placeholder="-----BEGIN CERTIFICATE-----" /></div>
      </div>
    </Drawer>
  );
}
