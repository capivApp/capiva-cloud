/**
 * Boot dos preview deployments: o evento de PR publicado no `gitEvents` chega ao
 * PreviewDeploymentService. Service substituído no container: sem banco.
 */
import { afterEach, describe, expect, mock, test } from "bun:test";
import { container } from "@di/index";
import { gitEvents, type PullRequestEvent } from "@infra/realtime/GitEventBus";
import { PreviewDeploymentService } from "@service/PreviewDeploymentService";
import { startPreviewDeployments } from "@bootstrap/previewDeployments";

const event: PullRequestEvent = {
  connectionId: "conn-1",
  organizationId: "org-1",
  provider: "GITLAB",
  action: "merged",
  number: 9,
  title: "Ajuste",
  repo: "acme/api",
  sourceBranch: "fix/ajuste",
  targetBranch: "main",
  headSha: "123abc",
};

describe("startPreviewDeployments", () => {
  let stop: () => void = () => undefined;
  afterEach(() => stop());

  test("encaminha o evento de PR ao service", async () => {
    const handlePullRequest = mock(async () => 1);
    container.register(PreviewDeploymentService, {
      handlePullRequest,
    } as unknown as PreviewDeploymentService);
    stop = startPreviewDeployments();

    gitEvents.emitPullRequest(event);
    await Promise.resolve();

    expect(handlePullRequest).toHaveBeenCalledWith(event);
  });

  test("falha do service não derruba o barramento", async () => {
    const handlePullRequest = mock(async () => Promise.reject(new Error("cluster fora")));
    container.register(PreviewDeploymentService, {
      handlePullRequest,
    } as unknown as PreviewDeploymentService);
    stop = startPreviewDeployments();

    expect(() => gitEvents.emitPullRequest(event)).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    expect(handlePullRequest).toHaveBeenCalledTimes(1);
  });
});
