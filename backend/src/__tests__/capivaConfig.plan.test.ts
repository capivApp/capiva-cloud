/**
 * Merge de precedência do capiva.json: o arquivo vence a tela SÓ nos campos que
 * declara, e só gera ação quando o valor difere do que já está gravado. Puro.
 */
import { describe, expect, it } from "bun:test";
import { planCapivaConfig, type CapivaSnapshot } from "@service/capivaConfig.strategy";
import { CapivaConfigError, parseCapivaConfig } from "@schemas/capivaConfig.schema";

const makeSnapshot = (overrides: Partial<CapivaSnapshot> = {}): CapivaSnapshot => ({
  app: {
    source: "GITHUB",
    port: 3000,
    profile: "SMALL",
    sourceConfig: { branch: "main", dockerfile: "Dockerfile", buildArgs: [] },
  },
  env: [],
  domains: [],
  volumes: [],
  scaling: null,
  ...overrides,
});

const plan = (config: object, snapshot = makeSnapshot()) => planCapivaConfig(parseCapivaConfig(JSON.stringify(config)), snapshot);

describe("planCapivaConfig: campos simples", () => {
  it("arquivo vazio não gera ação nem marca campo", () => {
    expect(plan({})).toEqual({ actions: [], fields: [], envKeys: [] });
  });

  it("valor igual ao da tela marca o campo, mas não gera ação", () => {
    const result = plan({ port: 3000, build: { dockerfile: "Dockerfile" } });
    expect(result.actions).toEqual([]);
    expect(result.fields).toEqual(expect.arrayContaining(["port", "dockerfile"]));
  });

  it("valor diferente vira um único patch com os campos alterados", () => {
    const result = plan({
      port: 8080,
      profile: "LARGE",
      replicas: 4,
      healthcheck: { path: "/saude" },
      build: { dockerfile: "Dockerfile.prod", context: "apps/api", startCommand: "bun start" },
    });
    expect(result.actions).toEqual([
      {
        kind: "patch",
        dto: { port: 8080, profile: "LARGE", replicas: 4, healthPath: "/saude", dockerfile: "Dockerfile.prod", subPath: "apps/api", startCommand: "bun start" },
      },
    ]);
  });

  it("campo não declarado continua com o valor da tela", () => {
    const result = plan({ port: 8080 });
    expect(result.fields).toEqual(["port"]);
    expect(result.actions).toEqual([{ kind: "patch", dto: { port: 8080 } }]);
  });

  it("build.type diferente da origem da aplicação falha cedo", () => {
    expect(() => plan({ build: { type: "GITLAB" } })).toThrow(CapivaConfigError);
  });
});

describe("planCapivaConfig: build args", () => {
  it("args declarados substituem os build args da tela", () => {
    const snapshot = makeSnapshot({
      app: { ...makeSnapshot().app, sourceConfig: { buildArgs: [{ key: "A", value: "1" }] } },
    });
    const result = plan({ build: { args: { B: "2" } } }, snapshot);
    expect(result.actions).toEqual([{ kind: "buildArgs", buildArgs: [{ key: "B", value: "2" }] }]);
    expect(result.fields).toContain("buildArgs");
  });
});

describe("planCapivaConfig: variáveis de ambiente", () => {
  const env: CapivaSnapshot["env"] = [
    { key: "LOG_LEVEL", value: "debug", secret: false, source: "MANUAL" },
    { key: "DB_PASSWORD", value: "", secret: true, source: "MANUAL" },
    { key: "DATABASE_URL", value: "postgres://...", secret: false, source: "INJECTED" },
  ];

  it("sobrescreve só as chaves do arquivo e preserva segredos da tela", () => {
    const result = plan({ env: { LOG_LEVEL: "info", NOVA: "x" } }, makeSnapshot({ env }));
    expect(result.actions).toEqual([
      {
        kind: "env",
        vars: [
          { key: "LOG_LEVEL", value: "info", secret: false },
          { key: "DB_PASSWORD", value: "", secret: true },
          { key: "NOVA", value: "x", secret: false },
        ],
      },
    ]);
    expect(result.envKeys).toEqual(["LOG_LEVEL", "NOVA"]);
  });

  it("preserva as variáveis do cofre externo, que o replace apagaria se ficassem fora do lote", () => {
    const comCofre: CapivaSnapshot["env"] = [
      ...env,
      { key: "API_TOKEN", value: "prod/api", secret: true, source: "EXTERNAL", secretStoreId: "store-1", remoteProperty: "token" },
    ];
    const result = plan({ env: { LOG_LEVEL: "info" } }, makeSnapshot({ env: comCofre }));
    expect(result.actions).toEqual([
      {
        kind: "env",
        vars: [
          { key: "LOG_LEVEL", value: "info", secret: false },
          { key: "DB_PASSWORD", value: "", secret: true },
          { key: "API_TOKEN", value: "prod/api", secret: true, external: { secretStoreId: "store-1", remoteKey: "prod/api", remoteProperty: "token" } },
        ],
      },
    ]);
  });

  it("chave do cofre declarada no arquivo passa a valer o valor do arquivo", () => {
    const comCofre: CapivaSnapshot["env"] = [
      { key: "API_TOKEN", value: "prod/api", secret: true, source: "EXTERNAL", secretStoreId: "store-1", remoteProperty: null },
    ];
    const result = plan({ env: { API_TOKEN: "local" } }, makeSnapshot({ env: comCofre }));
    expect(result.actions).toEqual([{ kind: "env", vars: [{ key: "API_TOKEN", value: "local", secret: false }] }]);
  });

  it("sem diferença, não regrava as variáveis", () => {
    const result = plan({ env: { LOG_LEVEL: "debug" } }, makeSnapshot({ env }));
    expect(result.actions).toEqual([]);
    expect(result.fields).toContain("env");
  });
});

describe("planCapivaConfig: autoscaling, domínios e volumes", () => {
  it("autoscaling diferente vira política nova", () => {
    const result = plan({ autoscaling: { min: 2, max: 5, target: 60 } });
    expect(result.actions).toEqual([{ kind: "scaling", policy: { minReplicas: 2, maxReplicas: 5, metric: "CPU", target: 60 } }]);
  });

  it("autoscaling igual não gera ação", () => {
    const scaling = { minReplicas: 2, maxReplicas: 5, metric: "CPU" as const, target: 60 };
    expect(plan({ autoscaling: { min: 2, max: 5, target: 60 } }, makeSnapshot({ scaling })).actions).toEqual([]);
  });

  it("a lista de domínios do arquivo é a lista inteira: adiciona e remove", () => {
    const domains = [
      { id: "d1", host: "antigo.exemplo.com" },
      { id: "d2", host: "api.exemplo.com" },
    ];
    const result = plan({ domains: ["API.exemplo.com", "novo.exemplo.com"] }, makeSnapshot({ domains }));
    expect(result.actions).toEqual([
      { kind: "addDomain", host: "novo.exemplo.com" },
      { kind: "removeDomain", domainId: "d1" },
    ]);
  });

  it("volumes do arquivo são criados, mas nenhum volume é removido", () => {
    const volumes = [{ name: "existente" }];
    const result = plan({ volumes: [{ name: "existente", mountPath: "/a" }, { name: "dados", mountPath: "/data", sizeGi: 2 }] }, makeSnapshot({ volumes }));
    expect(result.actions).toEqual([{ kind: "addVolume", volume: { name: "dados", mountPath: "/data", sizeGi: 2, accessMode: "RWO" } }]);
  });
});

describe("planCapivaConfig: preview de PR", () => {
  const preview = makeSnapshot({
    app: { ...makeSnapshot().app, profile: "NANO", previewOfId: "origem" },
    domains: [{ id: "d-pr", host: "pr-7.api.capiva.app" }],
  });
  const origem = {
    port: 8080,
    profile: "LARGE",
    replicas: 3,
    autoscaling: { min: 2, max: 6, target: 70 },
    domains: ["api.exemplo.com"],
    env: { LOG_LEVEL: "info" },
  };

  it("não toca em domínios, autoscaling, perfil e réplicas da origem", () => {
    const result = plan(origem, preview);
    expect(result.actions).toEqual([
      { kind: "patch", dto: { port: 8080 } },
      { kind: "env", vars: [{ key: "LOG_LEVEL", value: "info", secret: false }] },
    ]);
    expect(result.fields).toEqual(["port", "env"]);
  });

  it("a aplicação de origem continua recebendo todas as seções", () => {
    const result = plan(origem);
    expect(result.actions.map((a) => a.kind)).toEqual(["patch", "env", "scaling", "addDomain"]);
  });
});
