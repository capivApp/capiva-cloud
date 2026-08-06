import { container } from "@di/index";
import { DatabaseBackupService } from "@service/DatabaseBackupService";
import { withLeadership } from "@infra/scheduler/leaderElection";

/** Nome da lease — exportado para o shutdown liberar a liderança. */
export const DB_BACKUP_LOCK = "scheduler:database-backup";

/**
 * Scheduler dos backups de banco agendados (cron por banco). Igual ao de uptime,
 * roda no próprio processo da API sem dependência externa de cron.
 *
 * Tica a cada 30s para garantir ao menos uma avaliação por minuto de parede; o
 * `runScheduledBackups` deduplica execuções no mesmo minuto.
 *
 * Protegido por lease: a dedupe por minuto é feita em memória/consulta e não
 * resiste a réplicas concorrentes — sem o líder, N réplicas disparariam N Jobs
 * de dump do mesmo banco.
 */
export function startDatabaseBackupScheduler(intervalMs = 30_000): ReturnType<typeof setInterval> {
  const tick = () =>
    withLeadership(DB_BACKUP_LOCK, intervalMs, () => container.get(DatabaseBackupService).runScheduledBackups())
      .then((n) => n !== null && n > 0 && console.log(`[db-backup] ${n} backup(s) agendado(s) disparado(s)`))
      .catch((e) => console.error("[db-backup] scheduler:", (e as Error).message));

  setTimeout(tick, 10_000); // primeira avaliação pouco após o boot
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  return timer;
}
