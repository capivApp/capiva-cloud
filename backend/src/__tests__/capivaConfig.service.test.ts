/**
 * CapivaConfigService.applyForDeploy: leitura do arquivo no commit do deploy,
 * falha cedo sem tocar em nada quando inválido, e aplicação pelos MESMOS
 * services que a tela usa. Services e provedor Git mockados, sem banco.
 */
import { describe, expect, it, mock } from "bun:test";
import { CapivaConfigService } from "@service/CapivaConfigService";
import { CapivaConfigError } from "@schemas/capivaConfig.schema";
import { HttpError } from "@functions/HttpError";
import { isReconcileDeferred } from "@functions/reconcileScope";
import type { Application } from "@prisma-generated/client";

const tenant = { organizationId: "org1" };

const makeApp = (overrides: Partial<Application> = {}): Application =>
  ({
    id: "app1",
    name: "api",
    source: "GITHUB",
    gitConnectionId: "git1",
    port: 3000,
    profile: "SMALL",
    sourceConfig: { repo: "org/repo", branch: "main", subPath: "apps/api" },
    ...overrides,
  }) as Application;

const makeService = (files: Record<string, string> = {}, app = makeApp()) => {
  const readFile = mock(async (_repo: string, _ref: string, path: string) => files[path] ?? null);
  const apps = {
    getById: mock(async () => app),
    patch: mock(async () => app),
    replaceBuildArgs: mock(async () => app),
    addVolume: mock(async () => ({})),
    listVolumes: mock(async () => []),
    saveCapivaMarker: mock(async () => app),
  };
  const envVars = { list: mock(async () => []), replace: mock(async () => []) };
  const domains = {
    list: mock(async () => []),
    add: mock(async () => ({})),
    remove: mock(async () => undefined),
  };
  const scaling = { getPolicy: mock(async () => null), setPolicy: mock(async () => ({})) };
  const gitConnections = {
    getById: mock(async () => ({ provider: "GITHUB", webhookSecret: "s", baseUrl: null })),
    credentials: mock(async () => ({ token: "tok", provider: "GITHUB" })),
  };
  const factory = { build: mock(() => ({ readFile })) };
  const service = new CapivaConfigService(
    apps as never,
    envVars as never,
    domains as never,
    scaling as never,
    gitConnections as never,
    factory as never,
  );
  const events: string[] = [];
  const onEvent = mock(async (label: string) => {
    events.push(label);
  });
  return { service, readFile, apps, envVars, domains, scaling, onEvent, events };
};

describe("CapivaConfigService.applyForDeploy", () => {
  it("aplicação sem Git não lê arquivo nenhum", async () => {
    const { service, readFile, onEvent } = makeService(
      {},
      makeApp({ source: "DOCKER_IMAGE", gitConnectionId: null }),
    );
    const result = await service.applyForDeploy(
      makeApp({ source: "DOCKER_IMAGE", gitConnectionId: null }),
      "abc",
      tenant,
      onEvent,
    );
    expect(result.source).toBe("DOCKER_IMAGE");
    expect(readFile).not.toHaveBeenCalled();
  });

  it("procura primeiro no diretório da aplicação e lê no commit do deploy", async () => {
    const { service, readFile, onEvent } = makeService({ "capiva.json": "{}" });
    await service.applyForDeploy(makeApp(), "abc123", tenant, onEvent);
    expect(readFile.mock.calls.map((c) => c.slice(0, 3))).toEqual([
      ["org/repo", "abc123", "apps/api/capiva.json"],
      ["org/repo", "abc123", "capiva.json"],
    ]);
  });

  it("sem commit, usa a branch configurada", async () => {
    const { service, readFile, onEvent } = makeService();
    await service.applyForDeploy(makeApp(), undefined, tenant, onEvent);
    expect(readFile.mock.calls[0]?.[1]).toBe("main");
  });

  it("sem arquivo, limpa a marcação e não aplica nada", async () => {
    const { service, apps, onEvent } = makeService();
    const marcada = makeApp({
      sourceConfig: { repo: "org/repo", branch: "main", capivaJson: { fields: ["port"] } },
    });
    await service.applyForDeploy(marcada, "abc", tenant, onEvent);
    expect(apps.saveCapivaMarker).toHaveBeenCalledWith("app1", null, tenant);
    expect(apps.patch).not.toHaveBeenCalled();
    expect(onEvent).not.toHaveBeenCalled();
  });

  it("arquivo inválido registra a mensagem na timeline e falha sem tocar em nada", async () => {
    const { service, apps, envVars, events, onEvent } = makeService({
      "capiva.json": JSON.stringify({ port: -1 }),
    });
    expect(service.applyForDeploy(makeApp(), "abc", tenant, onEvent)).rejects.toBeInstanceOf(
      CapivaConfigError,
    );
    await Bun.sleep(0);
    expect(events[0]).toMatch(/^capiva\.json inválido: port/);
    expect(apps.patch).not.toHaveBeenCalled();
    expect(apps.saveCapivaMarker).not.toHaveBeenCalled();
    expect(envVars.replace).not.toHaveBeenCalled();
  });

  it("falha da API do provedor para o deploy com aviso na timeline", async () => {
    const { service, readFile, apps, events, onEvent } = makeService();
    readFile.mockImplementation(async () => {
      throw new Error("Git API 500");
    });
    expect(service.applyForDeploy(makeApp(), "abc", tenant, onEvent)).rejects.toBeInstanceOf(
      CapivaConfigError,
    );
    await Bun.sleep(0);
    expect(events[0]).toContain("Não foi possível ler o capiva.json");
    expect(apps.patch).not.toHaveBeenCalled();
  });

  it("arquivo válido passa pelos services da tela e grava a marcação", async () => {
    const config = {
      port: 8080,
      env: { LOG_LEVEL: "info" },
      domains: ["api.exemplo.com"],
      autoscaling: { min: 2, max: 4, target: 70 },
    };
    const { service, apps, envVars, domains, scaling, events, onEvent } = makeService({
      "apps/api/capiva.json": JSON.stringify(config),
    });
    await service.applyForDeploy(makeApp(), "abc", tenant, onEvent);

    expect(apps.patch).toHaveBeenCalledWith("app1", { port: 8080 }, tenant);
    expect(envVars.replace).toHaveBeenCalledWith(
      "app1",
      [{ key: "LOG_LEVEL", value: "info", secret: false }],
      tenant,
    );
    expect(domains.add).toHaveBeenCalledWith("app1", { host: "api.exemplo.com" }, tenant);
    expect(scaling.setPolicy).toHaveBeenCalledWith(
      "app1",
      { minReplicas: 2, maxReplicas: 4, metric: "CPU", target: 70 },
      tenant,
    );
    expect(apps.saveCapivaMarker).toHaveBeenCalledWith(
      "app1",
      {
        path: "apps/api/capiva.json",
        ref: "abc",
        fields: ["port", "env", "scaling", "domains"],
        envKeys: ["LOG_LEVEL"],
      },
      tenant,
    );
    expect(events).toEqual(["capiva.json aplicado (apps/api/capiva.json)"]);
  });

  it("origem por build do Git (NIXPACKS) com conexão e repositório também lê o arquivo", async () => {
    const nixpacks = makeApp({ source: "NIXPACKS" });
    const { service, readFile, apps, onEvent } = makeService(
      { "capiva.json": JSON.stringify({ build: { startCommand: "bun start" } }) },
      nixpacks,
    );
    await service.applyForDeploy(nixpacks, "abc", tenant, onEvent);
    expect(readFile).toHaveBeenCalled();
    expect(apps.patch).toHaveBeenCalledWith("app1", { startCommand: "bun start" }, tenant);
  });

  it("conexão Git sem repositório configurado não lê nem limpa nada", async () => {
    const semRepo = makeApp({ sourceConfig: { branch: "main", capivaJson: { fields: ["port"] } } });
    const { service, readFile, apps, onEvent } = makeService({}, semRepo);
    await service.applyForDeploy(semRepo, "abc", tenant, onEvent);
    expect(readFile).not.toHaveBeenCalled();
    expect(apps.saveCapivaMarker).not.toHaveBeenCalled();
  });

  it("os services da tela gravam sem reconciliar: o reconcile do deploy aplica depois do build", async () => {
    const { service, apps, envVars, domains, onEvent } = makeService({
      "capiva.json": JSON.stringify({ port: 8080, env: { A: "1" }, domains: ["api.exemplo.com"] }),
    });
    const deferred: boolean[] = [];
    const record = async () => void deferred.push(isReconcileDeferred());
    apps.patch.mockImplementation(async () => (await record(), makeApp()));
    envVars.replace.mockImplementation(async () => (await record(), []));
    domains.add.mockImplementation(async () => (await record(), {}));
    await service.applyForDeploy(makeApp(), "abc", tenant, onEvent);
    expect(deferred).toEqual([true, true, true]);
    expect(isReconcileDeferred()).toBe(false);
  });

  it("erro do service da tela vai para a timeline como erro do capiva.json, com a mensagem original", async () => {
    const { service, domains, apps, events, onEvent } = makeService({
      "capiva.json": JSON.stringify({ domains: ["api.exemplo.com"] }),
    });
    domains.add.mockImplementation(async () => {
      throw HttpError.conflict("Este domínio já está em uso.");
    });
    const error = await service
      .applyForDeploy(makeApp(), "abc", tenant, onEvent)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CapivaConfigError);
    expect((error as Error).message).toContain("Este domínio já está em uso.");
    expect(events).toEqual([(error as Error).message]);
    expect(apps.saveCapivaMarker).not.toHaveBeenCalled();
  });
});
