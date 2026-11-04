import { container } from "@di/index";
import { PreviewDeploymentService } from "@service/PreviewDeploymentService";
import { withLeadership } from "@infra/scheduler/leaderElection";

/** Nome da lease — exportado para o shutdown liberar a liderança. */
export const PREVIEW_CLEANUP_LOCK = "scheduler:preview-cleanup";

/**
 * Destrói previews de PR sem atividade há mais de `CAPIVA_PREVIEW_TTL_DAYS`
 * (PR esquecido aberto, ou evento de fechamento perdido). Protegido por lease:
 * com N réplicas, N destroys concorrentes do mesmo preview falhariam em
 * cascata no cluster.
 */
export function startPreviewCleanupScheduler(
  intervalMs = 60 * 60_000,
): ReturnType<typeof setInterval> {
  const tick = () =>
    withLeadership(PREVIEW_CLEANUP_LOCK, intervalMs, () =>
      container.get(PreviewDeploymentService).destroyExpired(),
    )
      .then(
        (n) =>
          n !== null && n > 0 && console.log(`[preview] ${n} preview(s) expirado(s) destruído(s)`),
      )
      .catch((e) => console.error("[preview] scheduler:", (e as Error).message));

  setTimeout(tick, 60_000); // primeira avaliação um minuto após o boot
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  return timer;
}
