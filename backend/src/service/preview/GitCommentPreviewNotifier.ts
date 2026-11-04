import { Injectable } from "@di/index";
import type { PullRequestEvent } from "@infra/realtime/GitEventBus";
import { GitService } from "@service/GitService";
import type { IPreviewNotifier } from "@service/preview/PreviewNotifier";

/** Texto do comentário no PR (upsert pelo marcador que o GitService acrescenta). */
export function buildPreviewComment(event: PullRequestEvent, previewUrl: string | null): string {
  if (!previewUrl) return `Preview do PR #${event.number} removido.`;
  return `Preview do PR #${event.number} no ar: ${previewUrl}`;
}

/**
 * Notifier de produção: comenta no PR/MR com a URL do preview. Best-effort:
 * token sem permissão ou provedor fora do ar não podem derrubar o preview.
 */
@Injectable()
export class GitCommentPreviewNotifier implements IPreviewNotifier {
  constructor(private readonly git: GitService) {}

  notify(event: PullRequestEvent, previewUrl: string | null): Promise<void> {
    return this.git
      .commentOnPullRequest(event.connectionId, event.repo, event.number, buildPreviewComment(event, previewUrl), {
        organizationId: event.organizationId,
      })
      .catch((e: Error) => console.error(`[preview] comentário no PR #${event.number}:`, e.message));
  }
}
