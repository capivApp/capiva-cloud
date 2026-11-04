import { Injectable } from "@di/index";
import type { PullRequestEvent } from "@infra/realtime/GitEventBus";

/** Porta de aviso no PR (comentário com a URL do preview; `null` = preview destruído). */
export interface IPreviewNotifier {
  notify(event: PullRequestEvent, previewUrl: string | null): Promise<void>;
  /** O preview não pôde ser criado (ex.: cota do ambiente): o PR recebe o motivo. */
  notifyFailure(event: PullRequestEvent, message: string): Promise<void>;
}

/**
 * Implementação padrão: não avisa ninguém. A classe também é o token de DI —
 * a integração com o Git troca a implementação antes do boot assinar o
 * barramento:
 *
 *   container.register(PreviewNotifier, container.get(GitCommentPreviewNotifier));
 */
@Injectable()
export class PreviewNotifier implements IPreviewNotifier {
  notify(_event: PullRequestEvent, _previewUrl: string | null): Promise<void> {
    return Promise.resolve();
  }

  notifyFailure(_event: PullRequestEvent, _message: string): Promise<void> {
    return Promise.resolve();
  }
}
