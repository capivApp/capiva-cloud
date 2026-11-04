import { container } from "@di/index";
import { AlertService } from "@service/AlertService";
import { withLeadership } from "@infra/scheduler/leaderElection";

/** Nome da lease — exportado para o shutdown liberar a liderança. */
export const ALERT_LOCK = "scheduler:alerts";

/**
 * Scheduler das regras de alerta por métrica. Igual ao de uptime: interval no
 * próprio processo da API.
 *
 * Protegido por lease: o estado da regra (OK/FIRING) é lido e gravado a cada
 * avaliação; com N réplicas avaliando ao mesmo tempo, duas veriam a mesma
 * transição e o canal receberia o alerta em dobro.
 */
export function startAlertScheduler(intervalMs = 60_000): ReturnType<typeof setInterval> {
  const tick = () =>
    withLeadership(ALERT_LOCK, intervalMs, () => container.get(AlertService).evaluateAll())
      .then((n) => n !== null && n > 0 && console.log(`[alert] ${n} regra(s) avaliada(s)`))
      .catch((e) => console.error("[alert] scheduler:", (e as Error).message));

  setTimeout(tick, 15_000); // primeira avaliação pouco após o boot
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  return timer;
}
