import { Injectable } from "@di/index";
import type { PullRequestEvent } from "@infra/realtime/GitEventBus";
import { GitService } from "@service/GitService";
import type { IPreviewNotifier } from "@service/preview/PreviewNotifier";

/** Texto do comentário no PR (upsert pelo marcador que o GitService acrescenta). */
export function buildPreviewComment(
  event: PullRequestEvent,
  previewUrl: string | null,
  notes: string[] = [],
): string {
  if (!previewUrl) return `Preview do PR #${event.number} removido.`;
  const avisos = notes.map((note) => `- ${note}`).join("\n");
  return [`Preview do PR #${event.number} no ar: ${previewUrl}`, avisos]
    .filter(Boolean)
    .join("\n\n");
}

/** Comentário de falha na criação. O motivo costuma vir com ponto final: fica um só. */
export function buildPreviewFailureComment(event: PullRequestEvent, message: string): string {
  return `Não foi possível criar o preview do PR #${event.number}: ${message.replace(/\.+$/, "")}.`;
}

/**
 * Notifier de produção: comenta no PR/MR com a URL do preview. Best-effort:
 * token sem permissão ou provedor fora do ar não podem derrubar o preview.
 */
@Injectable()
export class GitCommentPreviewNotifier implements IPreviewNotifier {
  constructor(private readonly git: GitService) {}

  notify(event: PullRequestEvent, previewUrl: string | null, notes: string[] = []): Promise<void> {
    return this.comment(event, buildPreviewComment(event, previewUrl, notes));
  }

  notifyFailure(event: PullRequestEvent, message: string): Promise<void> {
    return this.comment(event, buildPreviewFailureComment(event, message));
  }

  private comment(event: PullRequestEvent, body: string): Promise<void> {
    return this.git
      .commentOnPullRequest(event.connectionId, event.repo, event.number, body, {
        organizationId: event.organizationId,
      })
      .catch((e: Error) =>
        console.error(`[preview] comentário no PR #${event.number}:`, e.message),
      );
  }
}
