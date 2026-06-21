import { Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDatabases, type DatabaseDetail } from "@/hooks/useDatabases";

/** Drawer de configuração de um banco: URL de conexão + backups + senha. */
export function DatabaseDetailDrawer({ open, onClose, id }: { open: boolean; onClose: () => void; id: string | null }) {
  const { getDetail, update, refetch } = useDatabases();
  const [detail, setDetail] = useState<DatabaseDetail | null>(null);
  const [backupEnabled, setBackupEnabled] = useState(true);
  const [schedule, setSchedule] = useState("0 3 * * *");
  const [retentionDays, setRetentionDays] = useState(7);
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!open || !id) return;
    getDetail(id).then((d) => {
      setDetail(d);
      setBackupEnabled(d.backup?.enabled ?? true);
      setSchedule(d.backup?.schedule ?? "0 3 * * *");
      setRetentionDays(d.backup?.retentionDays ?? 7);
    }).catch((e) => toast.error((e as Error).message));
  }, [open, id]);

  async function save() {
    if (!id) return;
    try {
      await update({ id, patch: { backupEnabled, backupSchedule: schedule, retentionDays, password: password || undefined } });
      toast.success("Configuração salva");
      refetch();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function copy() {
    if (detail) {
      navigator.clipboard.writeText(detail.connectionUrl);
      toast.success("URL de conexão copiada");
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={detail ? detail.name : "Banco"}
      description={detail ? `${detail.kind} · ${detail.size}${detail.highAvailability ? " · HA" : ""}` : undefined}
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Fechar</Button><Button variant="gradient" onClick={save}>Salvar</Button></div>}
    >
      {!detail ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label>URL de conexão (montada automaticamente)</Label>
            <div className="flex gap-2">
              <Input readOnly value={detail.connectionUrl} className="font-mono text-xs" />
              <Button variant="outline" size="icon" onClick={copy}><Copy className="size-4" /></Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Usuário</Label><Input readOnly value={detail.username} /></div>
            <div className="space-y-1.5"><Label>Database</Label><Input readOnly value={detail.database} /></div>
          </div>
          <div className="space-y-1.5"><Label>Trocar senha</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="(deixe vazio para manter)" /></div>

          <div className="rounded-lg border border-border p-3 space-y-3">
            <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={backupEnabled} onChange={(e) => setBackupEnabled(e.target.checked)} className="accent-primary" /> Backups automáticos (S3)</label>
            {backupEnabled && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Agendamento (cron)</Label><Input value={schedule} onChange={(e) => setSchedule(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Retenção (dias)</Label><Input type="number" value={retentionDays} onChange={(e) => setRetentionDays(+e.target.value)} /></div>
              </div>
            )}
            <p className="text-xs text-muted-foreground">Configure o destino S3 global em Configurações → Armazenamento.</p>
          </div>
        </div>
      )}
    </Drawer>
  );
}
