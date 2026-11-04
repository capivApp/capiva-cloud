/**
 * DeploymentService: ref de leitura do capiva.json, erros que param antes do que está
 * no ar (sem rollback), status do commit no bloqueio do scan, pods que não sobem e o
 * deep link das notificações de rollback. Repositories, cluster e services mockados,
 * transação simulada. Sem banco.
 */
import { beforeAll, describe, expect, it, mock } from "bun:test";
import { CapivaConfigError } from "@schemas/capivaConfig.schema";
import { ImageScanBlockedError } from "@service/ImageScanService";
import { BuildConfigError } from "@infra/build/BuildConfigError";

await mock.module("@database/withTransaction", () => ({
  withTransaction: (fn: () => unknown) => fn(),
}));

let DeploymentService: typeof import("@service/DeploymentService").DeploymentService;

beforeAll(async () => {
  ({ DeploymentService } = await import("@service/DeploymentService"));
});

const tenant = { organizationId: "org1" };
const app = {
  id: "app1",
  name: "api",
  environmentId: "env1",
  source: "GITHUB",
  gitConnectionId: "git1",
  rolloutStrategy: "ROLLING",
  rolloutConfig: null,
  sourceConfig: { repo: "org/repo", branch: "main" },
  port: 3000,
};
const healthy = { id: "dep0", applicationId: "app1", version: "v0", imageRef: "registry/api:v0" };

type Observed = { ready: boolean; replicas?: number; raw?: Record<string, unknown> };

const makeService = (
  overrides: {
    observe?: Observed;
    podIssues?: string[];
    guard?: () => Promise<void>;
    build?: () => Promise<unknown>;
  } = {},
) => {
  const rows = new Map<string, Record<string, unknown>>([[healthy.id, healthy]]);
  const deployments = {
    create: mock(async (data: Record<string, unknown>) => {
      const row = { id: `dep${rows.size}`, ...data };
      rows.set(row.id, row);
      return row;
    }),
    findById: mock(async (id: string) => rows.get(id) ?? null),
    addEvent: mock(async () => ({})),
    update: mock(async () => ({})),
    lastHealthy: mock(async () => healthy),
  };
  const apps = { findById: mock(async () => app) };
  const builds = {
    resolve: () => ({ build: overrides.build ?? (async () => ({ imageRef: "registry/api:v1" })) }),
  };
  const kube = { forEnvironment: mock(async () => ({ kubeconfig: "cfg", namespace: "prod" })) };
  const k8s = {
    apply: mock(async () => undefined),
    observe: mock(async () => overrides.observe ?? { ready: true, replicas: 1 }),
    podHealth: mock(async () => ({ ready: 0, total: 1, issues: overrides.podIssues ?? [] })),
  };
  const appService = { reconcile: mock(async () => ({ ready: true, replicas: 1 })) };
  const notifications = { dispatch: mock(async () => undefined) };
  const gitConnections = { credentials: mock(async () => ({ token: "tok" })) };
  const registries = { defaultPushTarget: mock(async () => null) };
  const scans = { guard: mock(overrides.guard ?? (async () => undefined)) };
  const commitStatus = { report: mock(async () => undefined) };
  const capivaConfig = { applyForDeploy: mock(async () => app) };

  const service = new DeploymentService(
    deployments as never,
    apps as never,
    {} as never,
    {} as never,
    builds as never,
    kube as never,
    k8s as never,
    appService as never,
    notifications as never,
    gitConnections as never,
    registries as never,
    scans as never,
    commitStatus as never,
    capivaConfig as never,
  );
  const dispatched = (event: string) =>
    notifications.dispatch.mock.calls
      .map((c) => (c as unknown as [string, { event: string; data?: unknown }])[1])
      .filter((n) => n.event === event);
  return {
    service,
    deployments,
    appService,
    notifications,
    commitStatus,
    capivaConfig,
    dispatched,
  };
};

/** O `trigger` devolve na hora e roda o deploy em segundo plano. */
const waitFor = async (isDone: () => boolean): Promise<void> => {
  for (let i = 0; i < 200 && !isDone(); i++) await Bun.sleep(1);
  expect(isDone()).toBe(true);
};

const isFinished = (s: ReturnType<typeof makeService>) => () =>
  s.dispatched("deploy.failed").length + s.dispatched("deploy.succeeded").length > 0;

describe("DeploymentService: ref de leitura do capiva.json", () => {
  const refOf = async (commitId?: string, origin?: { commitSha?: string; gitRef?: string }) => {
    const s = makeService();
    await s.service.trigger("app1", "v1", tenant, commitId, origin);
    await waitFor(isFinished(s));
    return (s.capivaConfig.applyForDeploy.mock.calls[0] as unknown[])[1];
  };

  it("deploy por release lê o arquivo na tag que vai construir, não no HEAD", async () => {
    expect(await refOf(undefined, { gitRef: "v1.2.0" })).toBe("v1.2.0");
  });

  it("o sha completo do commit vence a tag", async () => {
    expect(await refOf("abc1234", { commitSha: "abc1234def", gitRef: "v1.2.0" })).toBe(
      "abc1234def",
    );
  });

  it("sem origem, usa o commit informado", async () => {
    expect(await refOf("abc1234")).toBe("abc1234");
  });
});

describe("DeploymentService: erros que param antes do que está no ar", () => {
  const cases: [string, () => Error][] = [
    ["capiva.json", () => new CapivaConfigError("capiva.json inválido: port")],
    ["scan", () => new ImageScanBlockedError("Imagem bloqueada.")],
    ["build", () => new BuildConfigError("Repositório ausente.")],
  ];

  for (const [name, makeError] of cases) {
    it(`erro de ${name} falha o deploy sem rollback`, async () => {
      const s = makeService({ build: async () => Promise.reject(makeError()) });
      await s.service.trigger("app1", "v1", tenant, "abc", { commitSha: "abc" });
      await waitFor(isFinished(s));
      expect(s.deployments.lastHealthy).not.toHaveBeenCalled();
      expect(s.appService.reconcile).not.toHaveBeenCalled();
    });
  }

  it("erro inesperado falha o deploy e restaura a versão estável", async () => {
    const s = makeService({ build: async () => Promise.reject(new Error("kaniko caiu")) });
    await s.service.trigger("app1", "v1", tenant, "abc", { commitSha: "abc" });
    await waitFor(() => s.dispatched("deploy.rollback").length > 0);
    expect(s.appService.reconcile).toHaveBeenCalledWith(app, tenant, undefined, healthy.imageRef);
  });
});

describe("DeploymentService: status do commit", () => {
  const phaseOnError = async (error: Error) => {
    const s = makeService({ guard: async () => Promise.reject(error) });
    await s.service.trigger("app1", "v1", tenant, "abc", { commitSha: "abc" });
    await waitFor(() => s.commitStatus.report.mock.calls.length >= 2);
    return (s.commitStatus.report.mock.calls.at(-1) as unknown[])[2];
  };

  it("imagem bloqueada pelo scan reprova o commit (failure)", async () => {
    expect(await phaseOnError(new ImageScanBlockedError("Imagem bloqueada."))).toBe("failed");
  });

  it("erro da plataforma continua como errored", async () => {
    expect(await phaseOnError(new Error("registry fora do ar"))).toBe("errored");
  });
});

describe("DeploymentService: pods que não ficam prontos", () => {
  it("pod em falha terminal dispara deploy.failed e o rollback automático", async () => {
    const s = makeService({ observe: { ready: false }, podIssues: ["api-1: ImagePullBackOff"] });
    await s.service.trigger("app1", "v1", tenant, "abc", { commitSha: "abc" });
    await waitFor(() => s.dispatched("deploy.rollback").length > 0);
    expect(s.dispatched("deploy.failed")).toHaveLength(1);
    expect(s.appService.reconcile).toHaveBeenLastCalledWith(
      app,
      tenant,
      undefined,
      healthy.imageRef,
    );
    expect((s.commitStatus.report.mock.calls.at(-1) as unknown[])[2]).toBe("failed");
  });

  it("rollout abortado pelo Argo falha o deploy sem um segundo rollback", async () => {
    const s = makeService({ observe: { ready: false, replicas: 2, raw: { abort: true } } });
    const deployment = await s.service.trigger("app1", "v1", tenant, "abc", { commitSha: "abc" });
    await waitFor(isFinished(s));
    expect(s.deployments.lastHealthy).not.toHaveBeenCalled();
    expect(s.dispatched("deploy.rollback")).toEqual([
      expect.objectContaining({ data: { applicationId: "app1", deploymentId: deployment.id } }),
    ]);
  });
});

describe("DeploymentService: notificação de rollback", () => {
  it("leva aplicação e deploy para o deep link do push", async () => {
    const s = makeService();
    const rollback = await s.service.rollbackTo("app1", healthy.id, tenant);
    expect(s.dispatched("deploy.rollback")).toEqual([
      expect.objectContaining({ data: { applicationId: "app1", deploymentId: rollback.id } }),
    ]);
  });
});
