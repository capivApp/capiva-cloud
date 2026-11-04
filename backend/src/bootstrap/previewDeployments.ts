import { container } from "@di/index";
import { gitEvents } from "@infra/realtime/GitEventBus";
import { PreviewDeploymentService } from "@service/PreviewDeploymentService";
import { GitCommentPreviewNotifier } from "@service/preview/GitCommentPreviewNotifier";
import { PreviewNotifier } from "@service/preview/PreviewNotifier";

/**
 * Liga os preview deployments ao barramento de eventos Git. O service é
 * resolvido a cada evento (e não no boot) para que a integração possa trocar
 * o `PreviewNotifier` no container a qualquer momento antes do primeiro PR.
 *
 * Não precisa de liderança: o webhook chega a UMA réplica e o barramento é em
 * memória, então só ela reage.
 */
export function startPreviewDeployments(): () => void {
  container.register(PreviewNotifier, container.get(GitCommentPreviewNotifier));
  return gitEvents.onPullRequest(async (event) => {
    const reagiram = await container
      .get(PreviewDeploymentService)
      .handlePullRequest(event)
      .catch((e) => {
        console.error("[preview] evento de PR:", (e as Error).message);
        return 0;
      });
    if (reagiram === 0) return;
    console.log(`[preview] PR #${event.number} (${event.action}): ${reagiram} aplicação(ões)`);
  });
}
