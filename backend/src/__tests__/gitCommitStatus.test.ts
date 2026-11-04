/**
 * Status do commit e comentário em PR/MR: chamadas HTTP de cada provedor (fetch
 * mockado, sem rede), mapeamento de estado por provedor e o CommitStatusService
 * (best-effort, provedor injetado por subclasse, sem banco).
 */
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { GiteaProvider, GitHubProvider, GitLabProvider } from "@infra/git/providers";
import { buildCommitStatus, buildDeploymentUrl, CommitStatusService } from "@service/CommitStatusService";
import type { CommitStatusInput, IGitProvider } from "@interface/integrations";

type Call = { url: string; method: string; body?: unknown; headers: Record<string, string> };

const SHA = "0d1a26e67d8f5eaf1f6ba5c57fc3c7d91ac0fd1c";
const STATUS: CommitStatusInput = {
  state: "failure",
  description: "Deploy falhou.",
  targetUrl: "https://painel.acme.dev/applications/app1?deployment=dep1",
  context: "capiva-cloud",
};

const realFetch = globalThis.fetch;
let calls: Call[] = [];
let responses: unknown[] = [];

beforeEach(() => {
  calls = [];
  responses = [];
  globalThis.fetch = mock(async (input: unknown, init?: RequestInit) => {
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ url: String(input), method: init?.method ?? "GET", body, headers: (init?.headers ?? {}) as Record<string, string> });
    return new Response(JSON.stringify(responses.shift() ?? {}), { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("setCommitStatus", () => {
  it("GitHub: POST /repos/:repo/statuses/:sha com o estado como está", async () => {
    await new GitHubProvider("tok", "sec", "https://api.github.com").setCommitStatus("acme/api", SHA, STATUS);
    expect(calls).toEqual([
      {
        url: `https://api.github.com/repos/acme/api/statuses/${SHA}`,
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
        body: { state: "failure", description: "Deploy falhou.", target_url: STATUS.targetUrl, context: "capiva-cloud" },
      },
    ]);
  });

  // GitLab não tem "failure" nem "error": os dois viram "failed"; o contexto vai em `name`.
  it("GitLab: POST /api/v4/projects/:id/statuses/:sha com estado traduzido", async () => {
    const gitlab = new GitLabProvider("tok", "sec", "https://gitlab.acme.dev");
    await gitlab.setCommitStatus("grupo/sub/api", SHA, STATUS);
    await gitlab.setCommitStatus("grupo/sub/api", SHA, { ...STATUS, state: "error" });
    await gitlab.setCommitStatus("grupo/sub/api", SHA, { ...STATUS, state: "pending" });
    await gitlab.setCommitStatus("grupo/sub/api", SHA, { ...STATUS, state: "success" });
    expect(calls[0]).toEqual({
      url: `https://gitlab.acme.dev/api/v4/projects/grupo%2Fsub%2Fapi/statuses/${SHA}`,
      method: "POST",
      headers: expect.objectContaining({ "PRIVATE-TOKEN": "tok" }),
      body: { state: "failed", description: "Deploy falhou.", target_url: STATUS.targetUrl, name: "capiva-cloud" },
    });
    expect(calls.map((c) => (c.body as { state: string }).state)).toEqual(["failed", "failed", "pending", "success"]);
  });

  it("Gitea self-hosted: POST /api/v1/repos/:repo/statuses/:sha", async () => {
    await new GiteaProvider("tok", "sec", "https://git.acme.dev").setCommitStatus("gitea/webhooks", SHA, { ...STATUS, state: "error" });
    expect(calls).toEqual([
      {
        url: `https://git.acme.dev/api/v1/repos/gitea/webhooks/statuses/${SHA}`,
        method: "POST",
        headers: expect.objectContaining({ Authorization: "token tok" }),
        body: { state: "error", description: "Deploy falhou.", target_url: STATUS.targetUrl, context: "capiva-cloud" },
      },
    ]);
  });

  it("falha HTTP vira erro (quem chama decide se engole)", async () => {
    globalThis.fetch = mock(async () => new Response("nope", { status: 403 })) as unknown as typeof fetch;
    expect(new GitHubProvider("tok", "sec", "https://api.github.com").setCommitStatus("acme/api", SHA, STATUS)).rejects.toThrow("403");
  });
});

describe("commentOnPullRequest (upsert pelo marcador)", () => {
  const MARKER = "<!-- capiva-preview -->";
  const BODY = `${MARKER}\nPreview pronto: https://pr-42.acme.dev`;

  it("GitHub: cria comentário quando não há um com o marcador", async () => {
    responses = [[{ id: 1, body: "LGTM" }]];
    await new GitHubProvider("tok", "sec", "https://api.github.com").commentOnPullRequest("acme/api", 42, BODY, MARKER);
    expect(calls.map((c) => [c.method, c.url])).toEqual([
      ["GET", "https://api.github.com/repos/acme/api/issues/42/comments?per_page=100"],
      ["POST", "https://api.github.com/repos/acme/api/issues/42/comments"],
    ]);
    expect(calls[1]?.body).toEqual({ body: BODY });
  });

  it("GitHub: atualiza o comentário que já tem o marcador", async () => {
    responses = [[{ id: 1, body: "LGTM" }, { id: 77, body: `${MARKER}\nantigo` }]];
    await new GitHubProvider("tok", "sec", "https://api.github.com").commentOnPullRequest("acme/api", 42, BODY, MARKER);
    expect(calls.map((c) => [c.method, c.url])).toEqual([
      ["GET", "https://api.github.com/repos/acme/api/issues/42/comments?per_page=100"],
      ["PATCH", "https://api.github.com/repos/acme/api/issues/comments/77"],
    ]);
    expect(calls[1]?.body).toEqual({ body: BODY });
  });

  it("GitLab: notas do MR (cria e atualiza)", async () => {
    const gitlab = new GitLabProvider("tok", "sec", "https://gitlab.acme.dev");
    responses = [[]];
    await gitlab.commentOnPullRequest("grupo/api", 3, BODY, MARKER);
    responses = [[{ id: 9, body: `${MARKER} velho` }]];
    await gitlab.commentOnPullRequest("grupo/api", 3, BODY, MARKER);
    expect(calls.map((c) => [c.method, c.url])).toEqual([
      ["GET", "https://gitlab.acme.dev/api/v4/projects/grupo%2Fapi/merge_requests/3/notes?per_page=100"],
      ["POST", "https://gitlab.acme.dev/api/v4/projects/grupo%2Fapi/merge_requests/3/notes"],
      ["GET", "https://gitlab.acme.dev/api/v4/projects/grupo%2Fapi/merge_requests/3/notes?per_page=100"],
      ["PUT", "https://gitlab.acme.dev/api/v4/projects/grupo%2Fapi/merge_requests/3/notes/9"],
    ]);
  });

  it("Gitea: comentários da issue do PR (cria e atualiza)", async () => {
    const gitea = new GiteaProvider("tok", "sec", "https://git.acme.dev");
    responses = [[]];
    await gitea.commentOnPullRequest("gitea/webhooks", 7, BODY, MARKER);
    responses = [[{ id: 5, body: `${MARKER} velho` }]];
    await gitea.commentOnPullRequest("gitea/webhooks", 7, BODY, MARKER);
    expect(calls.map((c) => [c.method, c.url])).toEqual([
      ["GET", "https://git.acme.dev/api/v1/repos/gitea/webhooks/issues/7/comments"],
      ["POST", "https://git.acme.dev/api/v1/repos/gitea/webhooks/issues/7/comments"],
      ["GET", "https://git.acme.dev/api/v1/repos/gitea/webhooks/issues/7/comments"],
      ["PATCH", "https://git.acme.dev/api/v1/repos/gitea/webhooks/issues/comments/5"],
    ]);
  });

  // Sem o marcador no texto o próximo upsert não acharia o comentário e duplicaria.
  it("acrescenta o marcador quando o texto não o traz", async () => {
    responses = [[]];
    await new GitHubProvider("tok", "sec", "https://api.github.com").commentOnPullRequest("acme/api", 42, "Preview pronto", MARKER);
    expect(calls[1]?.body).toEqual({ body: `${MARKER}\nPreview pronto` });
  });
});

describe("buildCommitStatus", () => {
  const url = "https://painel/x";

  it("mapeia cada fase do deploy para estado e descrição", () => {
    expect(buildCommitStatus("started", url)).toEqual({ state: "pending", description: "Deploy em andamento.", targetUrl: url, context: "capiva-cloud" });
    expect(buildCommitStatus("succeeded", url)).toEqual({ state: "success", description: "Deploy concluído.", targetUrl: url, context: "capiva-cloud" });
    expect(buildCommitStatus("failed", url)).toEqual({ state: "failure", description: "Deploy falhou.", targetUrl: url, context: "capiva-cloud" });
    expect(buildCommitStatus("errored", url)).toEqual({ state: "error", description: "Erro ao executar o deploy.", targetUrl: url, context: "capiva-cloud" });
  });

  it("aponta para o deploy no painel, sem barra dupla", () => {
    expect(buildDeploymentUrl("https://painel.acme.dev/", "app1", "dep1")).toBe("https://painel.acme.dev/applications/app1?deployment=dep1");
  });
});

describe("CommitStatusService", () => {
  const app = { id: "app1", gitConnectionId: "conn1", sourceConfig: { repo: "acme/api" } };
  const tenant = { organizationId: "org1" };

  /** Troca só a resolução do provedor (que lê o banco) por um provedor falso. */
  const makeService = (provider: { setCommitStatus?: ReturnType<typeof mock> } | null) => {
    const setCommitStatus = provider?.setCommitStatus ?? mock(async () => {});
    const fake = { setCommitStatus } as unknown as IGitProvider;
    class TestableCommitStatusService extends CommitStatusService {
      protected override async resolveProvider(): Promise<IGitProvider | null> {
        return provider === null ? null : fake;
      }
    }
    const service = new TestableCommitStatusService({} as never, {} as never);
    return { service, setCommitStatus };
  };

  it("reporta no repositório da app com o sha completo", async () => {
    const { service, setCommitStatus } = makeService({});
    await service.report(app, { sha: SHA, deploymentId: "dep1" }, "started", tenant);
    expect(setCommitStatus).toHaveBeenCalledWith("acme/api", SHA, expect.objectContaining({ state: "pending", context: "capiva-cloud" }));
    const status = setCommitStatus.mock.calls[0]?.[2] as CommitStatusInput;
    expect(status.targetUrl.endsWith("/applications/app1?deployment=dep1")).toBe(true);
  });

  it("não faz nada sem sha, sem conexão Git ou sem repositório", async () => {
    const { service, setCommitStatus } = makeService({});
    await service.report(app, { deploymentId: "dep1" }, "started", tenant);
    await service.report({ ...app, gitConnectionId: null }, { sha: SHA, deploymentId: "dep1" }, "started", tenant);
    await service.report({ ...app, sourceConfig: {} }, { sha: SHA, deploymentId: "dep1" }, "started", tenant);
    expect(setCommitStatus).not.toHaveBeenCalled();
  });

  it("usa fullName quando não há repo", async () => {
    const { service, setCommitStatus } = makeService({});
    await service.report({ ...app, sourceConfig: { fullName: "acme/web" } }, { sha: SHA, deploymentId: "dep1" }, "succeeded", tenant);
    expect(setCommitStatus).toHaveBeenCalledWith("acme/web", SHA, expect.objectContaining({ state: "success" }));
  });

  // O status é informativo: erro do provedor nunca pode derrubar o deploy.
  it("é best-effort: erro do provedor é engolido", async () => {
    const failing = mock(async () => {
      throw new Error("Git API 401");
    });
    const { service } = makeService({ setCommitStatus: failing });
    expect(service.report(app, { sha: SHA, deploymentId: "dep1" }, "failed", tenant)).resolves.toBeUndefined();
    expect(failing).toHaveBeenCalled();
  });

  it("conexão não encontrada também é ignorada", async () => {
    const { service } = makeService(null);
    expect(service.report(app, { sha: SHA, deploymentId: "dep1" }, "failed", tenant)).resolves.toBeUndefined();
  });
});
