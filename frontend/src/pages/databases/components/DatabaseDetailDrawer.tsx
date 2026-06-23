import { Copy, DatabaseBackup as BackupIcon, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDatabases, type DatabaseDetail } from "@/hooks/useDatabases";
import { useDatabaseBackups } from "@/hooks/useDatabaseBackups";
import { useStorageProviders } from "@/hooks/useStorageProviders";

const bkVariant = (s: string) => (s === "completed" ? "success" : s === "failed" ? "danger" : "warning");

/** Painel de backups manuais (dump → S3) de um banco PostgreSQL/MySQL. */
function DatabaseBackupsPanel({ databaseId, kind }: { databaseId: string; kind: string }) {
  const { backups, isLoading, run, isRunning, restore, isRestoring } = useDatabaseBackups(databaseId);
  const { providers } = useStorageProviders();
  const [scope, setScope] = useState<"single" | "all">("single");
  const [mode, setMode] = useState<"full" | "incremental">("full");
  const [storageProviderId, setStorageProviderId] = useState("");
  const supported = kind === "POSTGRESQL" || kind === "MYSQL";

  if (!supported) return null;

  // Confirmação inline (sem alert nativo): primeiro clique arma, segundo confirma.
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const trigger = () =>
    run({ scope, mode, storageProviderId: storageProviderId || undefined })
      .then(() => toast.success("Backup disparado"))
      .catch((e) => toast.error((e as Error).message));

  const runRestore = (backupId: string) => {
    if (confirmId !== backupId) {
      setConfirmId(backupId);
      return;
    }
    setConfirmId(null);
    restore(backupId)
      .then(() => toast.success("Restauração iniciada"))
      .catch((e) => toast.error((e as Error).message));
  };

  // Restore só faz sentido para objetos exatos (escopo single → destino .sql.gz).
  const restorable = (b: { status: string; destination: string | null }) => b.status === "completed" && Boolean(b.destination?.endsWith(".sql.gz"));

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <p className="flex items-center gap-2 text-sm font-medium"><BackupIcon className="size-4" /> Backups sob demanda</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Escopo</Label>
          <select className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" value={scope} onChange={(e) => setScope(e.target.value as "single" | "all")}>
            <option value="single">Este banco</option>
            <option value="all">Todos os bancos do servidor (1 arquivo cada)</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Tipo</Label>
          <select className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" value={mode} onChange={(e) => setMode(e.target.value as "full" | "incremental")}>
            <option value="full">Full</option>
            <option value="incremental">Incremental</option>
          </select>
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Destino (S3)</Label>
        <select className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" value={storageProviderId} onChange={(e) => setStorageProviderId(e.target.value)}>
          <option value="">Provedor padrão da organização</option>
          {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <Button variant="outline" size="sm" onClick={trigger} disabled={isRunning}><BackupIcon className="size-3.5" /> Fazer backup agora</Button>
      {isLoading && <p className="text-xs text-muted-foreground">Carregando…</p>}
      <div className="space-y-1">
        {backups.map((b) => (
          <div key={b.id} className="flex items-center justify-between rounded border border-border px-2 py-1 text-xs">
            <span className="text-muted-foreground">{new Date(b.startedAt).toLocaleString()}</span>
            <div className="flex items-center gap-2">
              <Badge variant={bkVariant(b.status)}>{b.status}</Badge>
              {restorable(b) && (
                <Button variant={confirmId === b.id ? "destructive" : "ghost"} size="sm" onClick={() => runRestore(b.id)} disabled={isRestoring}>
                  <RotateCcw className="size-3" /> {confirmId === b.id ? "Confirmar?" : "Restaurar"}
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Drawer de configuração de um banco: URL de conexão + backups + senha. */
export function DatabaseDetailDrawer({ open, onClose, id }: { open: boolean; onClose: () => void; id: string | null }) {
  const { getDetail, update, remove, isRemoving, refetch } = useDatabases();
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

  function copyText(text: string) {
    navigator.clipboard.writeText(text);
    toast.success("URL de conexão copiada");
  }

  async function removeDatabase() {
    if (!id || !detail) return;
    if (!window.confirm(`Remover o banco "${detail.name}"? Os dados e volumes serão apagados — esta ação é irreversível.`)) return;
    try {
      await remove(id);
      toast.success("Banco removido");
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
      title={detail ? detail.name : "Banco"}
      description={detail ? `${detail.kind} · ${detail.size}${detail.highAvailability ? " · HA" : ""}` : undefined}
      footer={<div className="flex items-center justify-between gap-2"><Button variant="ghost" className="text-destructive hover:text-destructive" onClick={removeDatabase} disabled={isRemoving}><Trash2 className="size-4" /> Remover</Button><div className="flex gap-2"><Button variant="ghost" onClick={onClose}>Fechar</Button><Button variant="gradient" onClick={save}>Salvar</Button></div></div>}
    >
      {!detail ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <div className="space-y-5">
          {/* Topologia/saúde ao vivo do operator. */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-border px-3 py-2">
              <p className="text-xs text-muted-foreground">Saúde</p>
              <Badge variant={detail.healthy ? "success" : detail.phase ? "warning" : "danger"} className="mt-1">
                {detail.healthy ? "Saudável" : detail.phase ? "Degradado" : "Indisponível"}
              </Badge>
            </div>
            <div className="rounded-lg border border-border px-3 py-2">
              <p className="text-xs text-muted-foreground">Réplicas prontas</p>
              <p className="mt-0.5 text-lg font-bold">
                {detail.readyInstances ?? "—"}<span className="text-sm text-muted-foreground"> / {detail.instances ?? (detail.highAvailability ? 3 : 1)}</span>
              </p>
            </div>
            <div className="rounded-lg border border-border px-3 py-2">
              <p className="text-xs text-muted-foreground">Fase</p>
              <p className="mt-0.5 truncate text-sm font-medium" title={detail.phase ?? ""}>{detail.phase ?? "—"}</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>URL de conexão interna (entre pods do cluster)</Label>
            <div className="flex gap-2">
              <Input readOnly value={detail.connectionUrl} className="font-mono text-xs" />
              <Button variant="outline" size="icon" onClick={() => copyText(detail.connectionUrl)}><Copy className="size-4" /></Button>
            </div>
          </div>

          {detail.connectionUrlExternal && (
            <div className="space-y-1.5">
              <Label>URL de conexão externa (IP do nó + NodePort)</Label>
              <div className="flex gap-2">
                <Input readOnly value={detail.connectionUrlExternal} className="font-mono text-xs" />
                <Button variant="outline" size="icon" onClick={() => copyText(detail.connectionUrlExternal!)}><Copy className="size-4" /></Button>
              </div>
              <p className="text-xs text-muted-foreground">Acesso de fora do cluster (ex.: seu micro). Garanta que a porta NodePort esteja liberada no firewall do nó.</p>
            </div>
          )}
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
            <p className="text-xs text-muted-foreground">O agendamento é executado pela plataforma (cron). Configure os destinos S3 em Organização → Storage.</p>
          </div>

          {id && <DatabaseBackupsPanel databaseId={id} kind={detail.kind} />}
        </div>
      )}
    </Drawer>
  );
}
