/**
 * Aviso do preview no PR: o notifier de produção comenta no PR/MR pelo
 * GitService (upsert pelo marcador). Falha do provedor nunca sobe.
 */
import { describe, expect, mock, test } from "bun:test";
import type { PullRequestEvent } from "@infra/realtime/GitEventBus";
import type { GitService } from "@service/GitService";
import {
  GitCommentPreviewNotifier,
  buildPreviewComment,
  buildPreviewFailureComment,
} from "@service/preview/GitCommentPreviewNotifier";

const event: PullRequestEvent = {
  connectionId: "conn-1",
  organizationId: "org-1",
  provider: "GITHUB",
  action: "opened",
  number: 42,
  title: "Nova tela",
  repo: "acme/api",
  sourceBranch: "feat/tela",
  targetBranch: "main",
  headSha: "abc123",
};

describe("buildPreviewComment", () => {
  test("com URL, diz onde o preview está", () => {
    expect(buildPreviewComment(event, "https://pr-42-api.preview.local")).toBe(
      "Preview do PR #42 no ar: https://pr-42-api.preview.local",
    );
  });

  test("avisos do banco entram como linhas depois da URL", () => {
    expect(
      buildPreviewComment(event, "https://pr-42-api.preview.local", [
        "O banco pg subiu vazio no preview: não há backup concluído.",
      ]),
    ).toBe(
      "Preview do PR #42 no ar: https://pr-42-api.preview.local\n\n- O banco pg subiu vazio no preview: não há backup concluído.",
    );
  });

  test("sem URL, avisa que o preview foi removido", () => {
    expect(buildPreviewComment(event, null)).toBe("Preview do PR #42 removido.");
  });
});

describe("buildPreviewFailureComment", () => {
  test("diz que o preview não foi criado e o motivo, com um ponto final só", () => {
    expect(buildPreviewFailureComment(event, "A cota de CPU do ambiente foi excedida.")).toBe(
      "Não foi possível criar o preview do PR #42: A cota de CPU do ambiente foi excedida.",
    );
    expect(buildPreviewFailureComment(event, "cota excedida")).toBe(
      "Não foi possível criar o preview do PR #42: cota excedida.",
    );
  });
});

describe("GitCommentPreviewNotifier", () => {
  test("comenta no PR da conexão e da organização do evento", async () => {
    const commentOnPullRequest = mock(async () => undefined);
    const notifier = new GitCommentPreviewNotifier({
      commentOnPullRequest,
    } as unknown as GitService);

    await notifier.notify(event, "https://pr-42-api.preview.local");

    expect(commentOnPullRequest).toHaveBeenCalledWith(
      "conn-1",
      "acme/api",
      42,
      "Preview do PR #42 no ar: https://pr-42-api.preview.local",
      {
        organizationId: "org-1",
      },
    );
  });

  test("falha na criação vira comentário no PR", async () => {
    const commentOnPullRequest = mock(async () => undefined);
    const notifier = new GitCommentPreviewNotifier({
      commentOnPullRequest,
    } as unknown as GitService);

    await notifier.notifyFailure(event, "cota excedida");

    expect(commentOnPullRequest).toHaveBeenCalledWith(
      "conn-1",
      "acme/api",
      42,
      "Não foi possível criar o preview do PR #42: cota excedida.",
      {
        organizationId: "org-1",
      },
    );
  });

  test("falha do provedor não sobe", async () => {
    const commentOnPullRequest = mock(async () => Promise.reject(new Error("token sem permissão")));
    const notifier = new GitCommentPreviewNotifier({
      commentOnPullRequest,
    } as unknown as GitService);

    expect(notifier.notify(event, null)).resolves.toBeUndefined();
  });
});
