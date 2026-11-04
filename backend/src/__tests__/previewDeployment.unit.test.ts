/**
 * Preview deployments por PR: nome e domínio do preview, filtro de elegibilidade,
 * montagem da cópia da aplicação, expiração por TTL e a strategy de cada ação do
 * PR. Operações (banco, cluster, aviso no PR) mockadas: sem banco e sem cluster.
 */
import { describe, expect, mock, test } from "bun:test";
import type { Application } from "@prisma-generated/client";
import type { PullRequestEvent } from "@infra/realtime/GitEventBus";
import { buildPreviewHost, buildPreviewName, buildPreviewUrl } from "@service/preview/previewNaming";
import {
  isOrigemDoRepositorio,
  isOrigemElegivelParaPreview,
  isPreviewExpirado,
  isPreviewsHabilitados,
} from "@service/preview/previewEligibility";
import { buildPreviewInput } from "@service/preview/previewInput";
import { createPreviewActionStrategy, type PreviewOperations } from "@service/preview/previewAction.strategy";
import { readPreviewSettings } from "@service/preview/previewSettings";

const makeApp = (overrides: Partial<Application> = {}): Application =>
  ({
    id: "app-1",
    projectId: "proj-1",
    environmentId: "env-1",
    name: "api",
    source: "GITHUB",
    sourceConfig: { repo: "acme/api", branch: "main", previews: { enabled: true }, buildArgs: [{ key: "A", value: "1" }] },
    tags: ["backend"],
    gitConnectionId: "conn-1",
    profile: "LARGE",
    customResources: null,
    rolloutStrategy: "CANARY",
    rolloutConfig: null,
    port: 8080,
    tlsMode: "LETS_ENCRYPT",
    tlsCertificateId: null,
    registryId: null,
    desiredStatus: "running",
    observedStatus: "running",
    previewOfId: null,
    previewPrNumber: null,
    createdAt: new Date("2026-11-01T12:00:00Z"),
    updatedAt: new Date("2026-11-01T12:00:00Z"),
    ...overrides,
  });

const makeEvent = (overrides: Partial<PullRequestEvent> = {}): PullRequestEvent => ({
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
  author: "mateus",
  url: "https://github.com/acme/api/pull/42",
  ...overrides,
});

describe("nome e domínio do preview", () => {
  test("nome segue pr-<n>-<app>", () => {
    expect(buildPreviewName(42, "api")).toBe("pr-42-api");
  });

  // O nome vira Deployment/Service/Ingress e rótulo DNS: limite de 63 caracteres.
  test("nome é truncado em 63 caracteres sem terminar em hífen", () => {
    const name = buildPreviewName(7, `${"a".repeat(55)}-bbbbbbbb`);
    expect(name.length).toBeLessThanOrEqual(63);
    expect(name.startsWith("pr-7-")).toBe(true);
    expect(name.endsWith("-")).toBe(false);
  });

  test("domínio deriva do domínio de preview configurado", () => {
    expect(buildPreviewHost("pr-42-api", "preview.capiva.cloud")).toBe("pr-42-api.preview.capiva.cloud");
    expect(buildPreviewHost("pr-42-api", ".Preview.Capiva.Cloud.")).toBe("pr-42-api.preview.capiva.cloud");
  });

  test("sem domínio de preview configurado não há host nem URL", () => {
    expect(buildPreviewHost("pr-42-api", undefined)).toBeNull();
    expect(buildPreviewHost("pr-42-api", "  ")).toBeNull();
    expect(buildPreviewUrl(null)).toBeNull();
  });

  test("URL usa https", () => {
    expect(buildPreviewUrl("pr-42-api.preview.capiva.cloud")).toBe("https://pr-42-api.preview.capiva.cloud");
  });

  test("configuração lida das variáveis de ambiente, com TTL padrão de 7 dias", () => {
    expect(readPreviewSettings({ CAPIVA_PREVIEW_DOMAIN: "preview.acme.dev" })).toEqual({ domain: "preview.acme.dev", ttlDays: 7 });
    expect(readPreviewSettings({ CAPIVA_PREVIEW_TTL_DAYS: "3" })).toEqual({ domain: undefined, ttlDays: 3 });
    expect(readPreviewSettings({ CAPIVA_PREVIEW_TTL_DAYS: "abc" }).ttlDays).toBe(7);
  });
});

describe("elegibilidade da aplicação de origem", () => {
  test("previews ficam desligados por padrão", () => {
    expect(isPreviewsHabilitados(makeApp({ sourceConfig: { repo: "acme/api" } }))).toBe(false);
    expect(isPreviewsHabilitados(makeApp())).toBe(true);
  });

  test("elegível: previews ligados, mesma conexão, mesmo repositório e branch de deploy = alvo do PR", () => {
    expect(isOrigemElegivelParaPreview(makeApp(), makeEvent())).toBe(true);
  });

  test("não elegível com previews desligados", () => {
    expect(isOrigemElegivelParaPreview(makeApp({ sourceConfig: { repo: "acme/api", branch: "main" } }), makeEvent())).toBe(false);
  });

  test("não elegível quando a branch de deploy não é a branch alvo do PR", () => {
    expect(isOrigemElegivelParaPreview(makeApp(), makeEvent({ targetBranch: "develop" }))).toBe(false);
  });

  test("branch de deploy ausente vale main", () => {
    const app = makeApp({ sourceConfig: { repo: "acme/api", previews: { enabled: true } } });
    expect(isOrigemElegivelParaPreview(app, makeEvent())).toBe(true);
  });

  test("não elegível para outro repositório ou outra conexão", () => {
    expect(isOrigemElegivelParaPreview(makeApp(), makeEvent({ repo: "acme/web" }))).toBe(false);
    expect(isOrigemElegivelParaPreview(makeApp(), makeEvent({ connectionId: "conn-2" }))).toBe(false);
  });

  test("repositório também pode vir em fullName", () => {
    const app = makeApp({ sourceConfig: { fullName: "acme/api", branch: "main", previews: { enabled: true } } });
    expect(isOrigemElegivelParaPreview(app, makeEvent())).toBe(true);
  });

  // Um preview não gera preview de si mesmo.
  test("aplicação que já é preview nunca é origem", () => {
    expect(isOrigemElegivelParaPreview(makeApp({ previewOfId: "app-0", previewPrNumber: 1 }), makeEvent())).toBe(false);
    expect(isOrigemDoRepositorio(makeApp({ previewOfId: "app-0", previewPrNumber: 1 }), makeEvent())).toBe(false);
  });

  // Fechar o PR destrói o preview mesmo que alguém tenha desligado os previews depois.
  test("origem do repositório ignora o toggle e a branch alvo", () => {
    const app = makeApp({ sourceConfig: { repo: "acme/api", branch: "develop" } });
    expect(isOrigemDoRepositorio(app, makeEvent())).toBe(true);
    expect(isOrigemDoRepositorio(app, makeEvent({ repo: "acme/web" }))).toBe(false);
  });
});

describe("cópia da aplicação para o preview", () => {
  const input = buildPreviewInput(makeApp(), makeEvent(), { domain: "preview.capiva.cloud", ttlDays: 7 });

  test("mesmo projeto, ambiente, origem e conexão", () => {
    expect(input.projectId).toBe("proj-1");
    expect(input.environmentId).toBe("env-1");
    expect(input.source).toBe("GITHUB");
    expect(input.gitConnectionId).toBe("conn-1");
    expect(input.port).toBe(8080);
  });

  test("nome do preview, perfil NANO e rollout simples", () => {
    expect(input.name).toBe("pr-42-api");
    expect(input.profile).toBe("NANO");
    expect(input.rolloutStrategy).toBe("ROLLING");
  });

  test("branch do PR, sem auto deploy por push e sem preview de preview", () => {
    expect(input.sourceConfig.branch).toBe("feat/tela");
    expect(input.sourceConfig.autoDeploy).toBe(false);
    expect(input.sourceConfig.previews).toEqual({ enabled: false });
    expect(input.sourceConfig.repo).toBe("acme/api");
  });

  test("domínio de preview e build args copiados", () => {
    expect(input.sourceConfig.domain).toBe("pr-42-api.preview.capiva.cloud");
    expect(input.buildArgs).toEqual([{ key: "A", value: "1" }]);
  });

  test("vínculo com a origem e com o PR", () => {
    expect(input.previewOf).toEqual({ applicationId: "app-1", prNumber: 42 });
    expect(input.sourceConfig.preview).toMatchObject({ number: 42, headSha: "abcdef1234567890", sourceBranch: "feat/tela" });
    expect(input.tags).toEqual(["backend", "preview"]);
  });

  test("TLS: segue a origem, mas certificado enviado vira Let's Encrypt (não cobre o host do preview)", () => {
    expect(buildPreviewInput(makeApp({ tlsMode: "NONE" }), makeEvent(), { domain: "p.dev", ttlDays: 7 }).tlsMode).toBe("NONE");
    expect(buildPreviewInput(makeApp({ tlsMode: "UPLOADED", tlsCertificateId: "c1" }), makeEvent(), { domain: "p.dev", ttlDays: 7 }).tlsMode).toBe("LETS_ENCRYPT");
  });

  test("sem domínio de preview configurado o preview nasce sem domínio", () => {
    const semDominio = buildPreviewInput(makeApp(), makeEvent(), { domain: undefined, ttlDays: 7 });
    expect(semDominio.sourceConfig.domain).toBeUndefined();
  });

  test("domínio da origem não é copiado", () => {
    const comDominio = buildPreviewInput(makeApp({ sourceConfig: { repo: "acme/api", domain: "api.acme.com" } }), makeEvent(), { domain: undefined, ttlDays: 7 });
    expect(comDominio.sourceConfig.domain).toBeUndefined();
  });
});

describe("expiração por TTL", () => {
  const now = new Date("2026-11-10T12:00:00Z");

  test("preview sem atividade há mais de N dias expira", () => {
    expect(isPreviewExpirado(makeApp({ previewOfId: "app-0", updatedAt: new Date("2026-11-02T12:00:00Z") }), now, 7)).toBe(true);
  });

  test("preview com atividade recente não expira", () => {
    expect(isPreviewExpirado(makeApp({ previewOfId: "app-0", updatedAt: new Date("2026-11-05T12:00:00Z") }), now, 7)).toBe(false);
  });

  test("aplicação que não é preview nunca expira", () => {
    expect(isPreviewExpirado(makeApp({ updatedAt: new Date("2020-01-01T00:00:00Z") }), now, 7)).toBe(false);
  });
});

const makeOps = (existing: Application | null = null) => {
  const preview = makeApp({ id: "prev-1", name: "pr-42-api", previewOfId: "app-1", previewPrNumber: 42 });
  const ops = {
    findPreview: mock(async () => existing),
    createPreview: mock(async () => preview),
    refreshPreview: mock(async (p: Application) => p),
    deployPreview: mock(async () => undefined),
    destroyPreview: mock(async () => undefined),
    notify: mock(async () => undefined),
    previewUrlOf: mock(() => "https://pr-42-api.preview.capiva.cloud"),
  } satisfies PreviewOperations;
  return { ops, preview };
};

describe("strategy por ação do PR", () => {
  test("opened cria, faz o deploy e avisa o PR com a URL", async () => {
    const { ops, preview } = makeOps();
    await createPreviewActionStrategy("opened")!.apply(makeApp(), makeEvent(), ops);
    expect(ops.createPreview).toHaveBeenCalledTimes(1);
    expect(ops.deployPreview).toHaveBeenCalledWith(preview, expect.objectContaining({ number: 42 }));
    expect(ops.notify).toHaveBeenCalledWith(expect.objectContaining({ number: 42 }), "https://pr-42-api.preview.capiva.cloud");
  });

  test("reopened se comporta como opened", async () => {
    const { ops } = makeOps();
    await createPreviewActionStrategy("reopened")!.apply(makeApp(), makeEvent({ action: "reopened" }), ops);
    expect(ops.createPreview).toHaveBeenCalledTimes(1);
    expect(ops.deployPreview).toHaveBeenCalledTimes(1);
  });

  // Webhook reentregue: não duplica a aplicação.
  test("opened com preview existente só redeploya", async () => {
    const existing = makeApp({ id: "prev-1", previewOfId: "app-1", previewPrNumber: 42 });
    const { ops } = makeOps(existing);
    await createPreviewActionStrategy("opened")!.apply(makeApp(), makeEvent(), ops);
    expect(ops.createPreview).not.toHaveBeenCalled();
    expect(ops.deployPreview).toHaveBeenCalledWith(existing, expect.anything());
  });

  test("synchronized redeploya o preview existente sem novo aviso", async () => {
    const existing = makeApp({ id: "prev-1", previewOfId: "app-1", previewPrNumber: 42 });
    const { ops } = makeOps(existing);
    await createPreviewActionStrategy("synchronized")!.apply(makeApp(), makeEvent({ action: "synchronized", headSha: "fff0000" }), ops);
    expect(ops.createPreview).not.toHaveBeenCalled();
    expect(ops.refreshPreview).toHaveBeenCalledWith(existing, expect.objectContaining({ headSha: "fff0000" }));
    expect(ops.deployPreview).toHaveBeenCalledTimes(1);
    expect(ops.notify).not.toHaveBeenCalled();
  });

  // PR aberto antes de ligar os previews: o primeiro push cria.
  test("synchronized sem preview cria um", async () => {
    const { ops } = makeOps();
    await createPreviewActionStrategy("synchronized")!.apply(makeApp(), makeEvent({ action: "synchronized" }), ops);
    expect(ops.createPreview).toHaveBeenCalledTimes(1);
    expect(ops.deployPreview).toHaveBeenCalledTimes(1);
    expect(ops.notify).toHaveBeenCalledTimes(1);
  });

  test.each(["closed", "merged"] as const)("%s destrói o preview e avisa o PR sem URL", async (action) => {
    const existing = makeApp({ id: "prev-1", previewOfId: "app-1", previewPrNumber: 42 });
    const { ops } = makeOps(existing);
    await createPreviewActionStrategy(action)!.apply(makeApp(), makeEvent({ action }), ops);
    expect(ops.destroyPreview).toHaveBeenCalledWith(existing);
    expect(ops.notify).toHaveBeenCalledWith(expect.objectContaining({ action }), null);
    expect(ops.deployPreview).not.toHaveBeenCalled();
  });

  test("closed sem preview não faz nada", async () => {
    const { ops } = makeOps();
    await createPreviewActionStrategy("closed")!.apply(makeApp(), makeEvent({ action: "closed" }), ops);
    expect(ops.destroyPreview).not.toHaveBeenCalled();
    expect(ops.notify).not.toHaveBeenCalled();
  });

  test("criação exige origem elegível; destruição só exige a origem do repositório", () => {
    const desligada = makeApp({ sourceConfig: { repo: "acme/api", branch: "main" } });
    expect(createPreviewActionStrategy("opened")!.isOrigemElegivel(desligada, makeEvent())).toBe(false);
    expect(createPreviewActionStrategy("synchronized")!.isOrigemElegivel(desligada, makeEvent())).toBe(false);
    expect(createPreviewActionStrategy("closed")!.isOrigemElegivel(desligada, makeEvent())).toBe(true);
  });

  test("ação desconhecida não tem strategy", () => {
    expect(createPreviewActionStrategy("labeled" as PullRequestEvent["action"])).toBeUndefined();
  });
});
