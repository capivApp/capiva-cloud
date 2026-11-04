/**
 * PreviewDeploymentService: o que a criação copia da origem (variáveis com o
 * cofre externo, dependências e a liberação de rede), o deploy com o commit do
 * PR e a limpeza das dependências na remoção. Repositories, services e
 * transação mockados: sem banco e sem cluster.
 */
import { beforeAll, describe, expect, mock, test } from "bun:test";
import type { Application, EnvVar, ServiceDependency } from "@prisma-generated/client";
import type { PullRequestEvent } from "@infra/realtime/GitEventBus";

await mock.module("@database/withTransaction", () => ({
  withTransaction: (fn: () => unknown) => fn(),
}));

let PreviewDeploymentService: typeof import("@service/PreviewDeploymentService").PreviewDeploymentService;

beforeAll(async () => {
  ({ PreviewDeploymentService } = await import("@service/PreviewDeploymentService"));
});

const tenant = { organizationId: "org-1" };

const origem = {
  id: "app-1",
  projectId: "proj-1",
  environmentId: "env-1",
  name: "api",
  source: "GITHUB",
  sourceConfig: { repo: "acme/api", branch: "main", previews: { enabled: true } },
  tags: [],
  gitConnectionId: "conn-1",
  tlsMode: "NONE",
  port: 8080,
  previewOfId: null,
  previewPrNumber: null,
} as unknown as Application;

const preview = {
  ...origem,
  id: "prev-1",
  name: "pr-42-api",
  previewOfId: "app-1",
  previewPrNumber: 42,
} as unknown as Application;

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
  headSha: "abcdef1234567890",
};

const externa = {
  key: "DB_PASSWORD",
  value: "prod/db",
  secret: false,
  source: "EXTERNAL",
  secretStoreId: "store-1",
  remoteProperty: "password",
} as unknown as EnvVar;

const dependencia = {
  id: "dep-1",
  sourceId: "app-1",
  targetId: "db-1",
  injectedKeys: [{ key: "DB_URL", form: "URL" }],
} as unknown as ServiceDependency;

function makeService() {
  const apps = {
    listByGitConnection: mock(async () => [origem]),
    findPreview: mock(async () => null),
  };
  const envVars = {
    listByApplication: mock(async () => [externa]),
    upsert: mock(async () => undefined),
  };
  const deps = {
    listBySource: mock(async () => [dependencia]),
    create: mock(async () => undefined),
    listTargetEnvironmentIds: mock(async () => ["env-dados"]),
  };
  const networkPolicies = { syncEnvironmentQuietly: mock(async () => undefined) };
  const appService = {
    create: mock(async () => preview),
    getById: mock(async () => preview),
    remove: mock(async () => undefined),
  };
  const deployments = { trigger: mock(async () => undefined) };
  const notifier = {
    notify: mock(async () => undefined),
    notifyFailure: mock(async () => undefined),
  };
  const service = new PreviewDeploymentService(
    apps as never,
    envVars as never,
    deps as never,
    networkPolicies as never,
    appService as never,
    deployments as never,
    notifier,
  );
  return { service, apps, envVars, deps, networkPolicies, appService, deployments, notifier };
}

describe("criação do preview", () => {
  // Sem o cofre, o containerEnv descarta a variável EXTERNAL e o preview sobe sem o segredo.
  test("variável de cofre externo é copiada com o cofre e a propriedade", async () => {
    const { service, envVars } = makeService();
    await service.handlePullRequest(event);
    expect(envVars.upsert).toHaveBeenCalledWith({
      applicationId: "prev-1",
      key: "DB_PASSWORD",
      value: "prod/db",
      secret: false,
      source: "EXTERNAL",
      secretStoreId: "store-1",
      remoteProperty: "password",
    });
  });

  // Com isolamento de rede, a dependência em outro ambiente só libera quem tem a aresta.
  test("dependências da origem são copiadas para o preview e a rede do destino é sincronizada", async () => {
    const { service, deps, networkPolicies } = makeService();
    await service.handlePullRequest(event);
    expect(deps.listBySource).toHaveBeenCalledWith("app-1");
    expect(deps.create).toHaveBeenCalledWith({
      sourceId: "prev-1",
      targetId: "db-1",
      injectedKeys: [{ key: "DB_URL", form: "URL" }],
    });
    expect(deps.listTargetEnvironmentIds).toHaveBeenCalledWith("prev-1");
    expect(networkPolicies.syncEnvironmentQuietly).toHaveBeenCalledWith("env-dados", tenant);
  });

  // Sem a origem do commit, o deploy do preview nunca reporta status no PR.
  test("deploy do preview leva o commit do head do PR", async () => {
    const { service, deployments } = makeService();
    await service.handlePullRequest(event);
    expect(deployments.trigger).toHaveBeenCalledWith("prev-1", "abcdef1", tenant, undefined, {
      commitSha: "abcdef1234567890",
    });
  });
});

describe("remoção do preview", () => {
  // O cascade apaga as arestas, mas a NetworkPolicy do destino continuaria liberando o nome do preview.
  test("pela tela: remove o preview e sincroniza a rede dos ambientes de que ele dependia", async () => {
    const { service, deps, appService, networkPolicies } = makeService();
    await service.destroyPreview("app-1", "prev-1", tenant);
    expect(deps.listTargetEnvironmentIds).toHaveBeenCalledWith("prev-1");
    expect(appService.remove).toHaveBeenCalledWith("prev-1", tenant);
    expect(networkPolicies.syncEnvironmentQuietly).toHaveBeenCalledWith("env-dados", tenant);
  });

  test("ao fechar o PR: remove o preview e sincroniza a rede", async () => {
    const { service, apps, appService, networkPolicies } = makeService();
    apps.findPreview.mockImplementation(async () => preview as never);
    await service.handlePullRequest({ ...event, action: "closed" });
    expect(appService.remove).toHaveBeenCalledWith("prev-1", tenant);
    expect(networkPolicies.syncEnvironmentQuietly).toHaveBeenCalledWith("env-dados", tenant);
  });
});
