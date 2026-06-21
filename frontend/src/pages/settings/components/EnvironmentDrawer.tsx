import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useClusters } from "@/hooks/useClusters";
import { useEnvironments } from "@/hooks/useEnvironments";

export interface EnvEditing {
  id: string;
  name: string;
  kind: string;
  clusterId: string | null;
}

export function EnvironmentDrawer({ open, onClose, editing, onSaved }: { open: boolean; onClose: () => void; editing?: EnvEditing | null; onSaved: () => void }) {
  const { create, update, isCreating } = useEnvironments();
  const { clusters } = useClusters();
  const [f, setF] = useState({ name: "", kind: "PRODUCTION", clusterId: "" });

  useEffect(() => {
    if (open) setF({ name: editing?.name ?? "", kind: editing?.kind ?? "PRODUCTION", clusterId: editing?.clusterId ?? "" });
  }, [open, editing]);

  async function submit() {
    if (!f.name) return toast.error("Informe um nome.");
    try {
      if (editing) await update({ id: editing.id, patch: { name: f.name, kind: f.kind, clusterId: f.clusterId || null } });
      else await create({ name: f.name, kind: f.kind as any, clusterId: f.clusterId || undefined });
      toast.success(editing ? "Ambiente atualizado" : "Ambiente criado");
      onSaved();
      onClose();
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <Drawer open={open} onClose={onClose} title={editing ? "Editar ambiente" : "Novo ambiente"} footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="gradient" onClick={submit} disabled={isCreating}>{editing ? "Salvar" : "Criar"}</Button></div>}>
      <div className="space-y-3">
        <div className="space-y-1.5"><Label>Nome</Label><Input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Produção" /></div>
        <div className="space-y-1.5"><Label>Tipo</Label><select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="DEVELOPMENT">Dev</option><option value="STAGING">Homolog</option><option value="PRODUCTION">Produção</option></select></div>
        <div className="space-y-1.5"><Label>Cluster</Label><select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={f.clusterId} onChange={(e) => setF({ ...f, clusterId: e.target.value })}><option value="">(nenhum)</option>{clusters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      </div>
    </Drawer>
  );
}
