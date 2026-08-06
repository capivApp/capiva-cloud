import { container } from "@di/index";
import { UptimeService } from "@service/UptimeService";
import { withLeadership } from "@infra/scheduler/leaderElection";

/** Nome da lease — exportado para o shutdown liberar a liderança. */
export const UPTIME_LOCK = "scheduler:uptime";

/**
 * Scheduler simples (interval) que executa as uptime checks habilitadas.
 * Sem dependência externa de cron — roda no próprio processo da API.
 *
 * Protegido por lease: com várias réplicas, apenas o líder sonda (senão cada
 * domínio monitorado receberia N× o tráfego e o histórico ficaria duplicado).
 */
export function startUptimeScheduler(intervalMs = 60_000): ReturnType<typeof setInterval> {
  const tick = () =>
    withLeadership(UPTIME_LOCK, intervalMs, () => container.get(UptimeService).runAllDue())
      .then((n) => n !== null && n > 0 && console.log(`[uptime] ${n} verificações executadas`))
      .catch((e) => console.error("[uptime] scheduler:", (e as Error).message));

  setTimeout(tick, 5_000); // primeira execução pouco depois do boot
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  return timer;
}
