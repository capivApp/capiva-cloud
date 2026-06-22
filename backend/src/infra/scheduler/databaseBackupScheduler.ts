import { container } from "@di/index";
import { DatabaseBackupService } from "@service/DatabaseBackupService";

/**
 * Scheduler dos backups de banco agendados (cron por banco). Igual ao de uptime,
 * roda no próprio processo da API sem dependência externa de cron.
 *
 * Tica a cada 30s para garantir ao menos uma avaliação por minuto de parede; o
 * `runScheduledBackups` deduplica execuções no mesmo minuto.
 */
export function startDatabaseBackupScheduler(intervalMs = 30_000): ReturnType<typeof setInterval> {
  const tick = () =>
    container
      .get(DatabaseBackupService)
      .runScheduledBackups()
      .then((n) => n > 0 && console.log(`[db-backup] ${n} backup(s) agendado(s) disparado(s)`))
      .catch((e) => console.error("[db-backup] scheduler:", (e as Error).message));

  setTimeout(tick, 10_000); // primeira avaliação pouco após o boot
  return setInterval(tick, intervalMs);
}
