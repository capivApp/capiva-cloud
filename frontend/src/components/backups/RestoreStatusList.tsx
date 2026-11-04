import { Badge } from "@/components/ui/badge";
import type { BackupRestore, RestoreMode, RestoreStatus } from "@/hooks/useBackupRestores";

const STATUS: Record<RestoreStatus, { label: string; variant: "muted" | "warning" | "success" | "danger" }> = {
  PENDING: { label: "Pendente", variant: "muted" },
  RUNNING: { label: "Executando", variant: "warning" },
  COMPLETED: { label: "Concluído", variant: "success" },
  FAILED: { label: "Falhou", variant: "danger" },
};

const MODE: Record<RestoreMode, string> = {
  IN_PLACE: "Sobre o banco atual",
  AS_COPY: "Como cópia",
};

/** Andamento dos restores pedidos (banco ou volume). */
export function RestoreStatusList({ restores, showMode = true }: { restores: BackupRestore[]; showMode?: boolean }) {
  if (restores.length === 0) return null;

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">Restaurações</p>
      {restores.map((restore) => (
        <div key={restore.id} className="space-y-0.5 rounded border border-border px-2 py-1 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-muted-foreground">
              {new Date(restore.startedAt).toLocaleString()}
              {showMode && ` · ${MODE[restore.mode]}`}
              {restore.targetName && ` · ${restore.targetName}`}
            </span>
            <Badge variant={STATUS[restore.status].variant}>{STATUS[restore.status].label}</Badge>
          </div>
          {restore.message && <p className="text-destructive">{restore.message}</p>}
        </div>
      ))}
    </div>
  );
}
