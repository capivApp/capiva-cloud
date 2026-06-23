import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useDatabases } from "@/hooks/useDatabases";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";

const KINDS = ["POSTGRESQL", "MYSQL", "REDIS", "RABBITMQ", "KAFKA", "MINIO", "ELASTICSEARCH", "CLICKHOUSE"];
const SIZES = [
  { id: "EXTRA_SMALL", label: "Extra Small", storage: "2 GB" },
  { id: "SMALL", label: "Small", storage: "10 GB" },
  { id: "MEDIUM", label: "Medium", storage: "50 GB" },
  { id: "LARGE", label: "Large", storage: "100 GB" },
];

/** Drawer de criação de banco — sem prompt nativo, com credenciais e backups. */
export function CreateDatabaseDrawer({ open, onClose, presetKind }: { open: boolean; onClose: () => void; presetKind?: string }) {
  const { projectId, environmentId } = useWorkspaceStore();
  const { create, isCreating, refetch } = useDatabases(projectId);
  const [f, setF] = useState({
    name: "",
    kind: presetKind ?? "POSTGRESQL",
    size: "SMALL",
    ha: false,
    username: "capiva",
    password: "",
    database: "",
    backupEnabled: true,
    backupSchedule: "0 3 * * *",
    retentionDays: 7,
  });
  const set = (p: Partial<typeof f>) => setF({ ...f, ...p });

  async function submit() {
    if (!projectId || !environmentId) return toast.error("Selecione projeto e ambiente no topo.");
    if (!f.name) return toast.error("Informe um nome.");
    try {
      await create({
        projectId,
        environmentId,
        name: f.name,
        kind: presetKind ?? f.kind,
        size: f.size,
        highAvailability: f.ha,
        username: f.username,
        password: f.password || undefined,
        database: f.database || undefined,
        backupEnabled: f.backupEnabled,
        backupSchedule: f.backupSchedule,
        retentionDays: f.retentionDays,
      });
      toast.success("Banco criado — credenciais e URL geradas automaticamente.");
      refetch();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`Novo banco${presetKind ? ` · ${presetKind}` : ""}`}
      description="Credenciais, persistência, backups e monitoramento configurados automaticamente."
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="gradient" onClick={submit} disabled={isCreating}>Criar banco</Button></div>}
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Nome</Label><Input autoFocus value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="vendas-db" /></div>
          {!presetKind && (
            <div className="space-y-1.5"><Label>Tipo</Label><select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={f.kind} onChange={(e) => set({ kind: e.target.value })}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select></div>
          )}
        </div>

        <div className="space-y-2">
          <Label>Tamanho</Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{SIZES.map((s) => <button key={s.id} onClick={() => set({ size: s.id })} className={cn("rounded-lg border px-3 py-1.5 text-left text-sm", f.size === s.id ? "border-primary bg-primary/10" : "border-border")}><span className="block font-medium">{s.label}</span><span className="block text-xs text-muted-foreground">{s.storage}</span></button>)}</div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Usuário</Label><Input value={f.username} onChange={(e) => set({ username: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Senha</Label><Input type="password" value={f.password} onChange={(e) => set({ password: e.target.value })} placeholder="(gerada se vazia)" /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Database</Label><Input value={f.database} onChange={(e) => set({ database: e.target.value })} placeholder="(= nome se vazio)" /></div>
        </div>

        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.ha} onChange={(e) => set({ ha: e.target.checked })} className="accent-primary" /> Alta disponibilidade (failover + replicação)</label>

        <div className="rounded-lg border border-border p-3 space-y-3">
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={f.backupEnabled} onChange={(e) => set({ backupEnabled: e.target.checked })} className="accent-primary" /> Backups automáticos (S3)</label>
          {f.backupEnabled && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Agendamento (cron)</Label><Input value={f.backupSchedule} onChange={(e) => set({ backupSchedule: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Retenção (dias)</Label><Input type="number" value={f.retentionDays} onChange={(e) => set({ retentionDays: +e.target.value })} /></div>
            </div>
          )}
        </div>
      </div>
    </Drawer>
  );
}
