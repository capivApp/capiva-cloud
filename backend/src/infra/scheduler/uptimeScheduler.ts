import { container } from "@di/index";
import { UptimeService } from "@service/UptimeService";

/**
 * Scheduler simples (interval) que executa as uptime checks habilitadas.
 * Sem dependência externa de cron — roda no próprio processo da API.
 */
export function startUptimeScheduler(intervalMs = 60_000): ReturnType<typeof setInterval> {
  const tick = () =>
    container
      .get(UptimeService)
      .runAllDue()
      .then((n) => n > 0 && console.log(`[uptime] ${n} verificações executadas`))
      .catch((e) => console.error("[uptime] scheduler:", (e as Error).message));

  setTimeout(tick, 5_000); // primeira execução pouco depois do boot
  return setInterval(tick, intervalMs);
}
