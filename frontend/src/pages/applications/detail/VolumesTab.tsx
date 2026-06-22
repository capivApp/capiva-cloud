import { DatabaseBackup, HardDrive, RotateCcw, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { VolumeEditor } from "@/pages/applications/components/VolumeEditor";
import type { VolumeSpec } from "@/pages/applications/hooks/useApplications";
import { useVolumes, type Volume } from "@/pages/applications/hooks/useVolumes";
import { useVolumeBackups } from "@/pages/applications/hooks/useVolumeBackups";

const backupVariant = (s: string) => (s === "completed" ? "success" : s === "failed" ? "danger" : "warning");

/** Painel de backups de um volume: criar snapshot→S3, listar e restaurar. */
function VolumeBackups({ applicationId, volume }: { applicationId: string; volume: Volume }) {
  const { backups, isLoading, create, isCreating, restore } = useVolumeBackups(applicationId, volume.id);
  const run = (fn: () => Promise<unknown>, ok: string) => () => fn().then(() => toast.success(ok)).catch((e) => toast.error((e as Error).message));

  return (
    <div className="mt-2 space-y-2 border-t border-border pt-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Backups</span>
        <Button variant="outline" size="sm" onClick={run(() => create(undefined), "Backup disparado")} disabled={isCreating}>
          <DatabaseBackup className="size-3.5" /> Fazer backup
        </Button>
      </div>
      {isLoading && <p className="text-xs text-muted-foreground">Carregando…</p>}
      {!isLoading && backups.length === 0 && <p className="text-xs text-muted-foreground">Nenhum backup.</p>}
      {backups.map((b) => (
        <div key={b.id} className="flex items-center justify-between rounded border border-border px-2 py-1 text-xs">
          <span className="text-muted-foreground">{new Date(b.startedAt).toLocaleString()}</span>
          <div className="flex items-center gap-2">
            <Badge variant={backupVariant(b.status)}>{b.status}</Badge>
            {b.status === "completed" && (
              <Button variant="ghost" size="sm" onClick={run(() => restore(b.id), "Restauração iniciada")}><RotateCcw className="size-3" /> Restaurar</Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Aba "Volumes" do detalhe da aplicação: lista os volumes montados e permite
 * adicionar/remover. Cada mudança reconcilia o PVC e remonta no Deployment.
 */
export function VolumesTab({ applicationId }: { applicationId: string }) {
  const { volumes, isLoading, create, isCreating, remove } = useVolumes(applicationId);
  const [draft, setDraft] = useState<VolumeSpec[]>([]);

  const add = async () => {
    const ready = draft.filter((v) => v.name.trim() && v.mountPath.trim());
    if (ready.length === 0) return toast.error("Informe nome e pasta do volume.");
    try {
      for (const v of ready) await create(v);
      setDraft([]);
      toast.success("Volume(s) adicionado(s). Reconciliando…");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const del = async (id: string) => {
    try {
      await remove(id);
      toast.success("Volume removido.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="space-y-3 pt-5">
          {isLoading && <p className="text-sm text-muted-foreground">Carregando volumes…</p>}
          {!isLoading && volumes.length === 0 && <p className="text-sm text-muted-foreground">Nenhum volume montado.</p>}
          {volumes.map((v) => (
            <div key={v.id} className="rounded-lg border border-border px-3 py-2.5 text-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <HardDrive className="size-4 text-muted-foreground" />
                  <span className="font-medium">{v.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{v.mountPath}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{v.sizeGi} Gi</span>
                  {v.accessMode === "RWX" ? (
                    <Badge variant="success"><Users className="mr-1 size-3" /> Compartilhado</Badge>
                  ) : (
                    <Badge variant="warning">Exclusivo</Badge>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => del(v.id)}><Trash2 className="size-4" /></Button>
                </div>
              </div>
              <VolumeBackups applicationId={applicationId} volume={v} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-5">
          <p className="text-sm font-medium">Adicionar volume</p>
          <VolumeEditor list={draft} setList={setDraft} />
          {draft.length > 0 && (
            <Button variant="gradient" size="sm" onClick={add} disabled={isCreating}>Salvar e reconciliar</Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
