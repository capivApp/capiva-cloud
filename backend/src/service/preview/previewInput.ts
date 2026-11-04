import type { Application } from "@prisma-generated/client";
import type { PullRequestEvent } from "@infra/realtime/GitEventBus";
import type { CreateApplicationInput } from "@service/ApplicationService";
import type { TlsModeManifest } from "@infra/kubernetes/manifests";
import { buildPreviewHost, buildPreviewName } from "@service/preview/previewNaming";
import type { PreviewSettings } from "@service/preview/previewSettings";

/**
 * Certificado enviado pelo usuário cobre o domínio da ORIGEM, não o host do
 * preview: o preview cai para Let's Encrypt. Sem TLS na origem (cluster local,
 * sem cert-manager) continua sem TLS.
 */
const PREVIEW_TLS_MODE: Record<Application["tlsMode"], TlsModeManifest> = {
  LETS_ENCRYPT: "LETS_ENCRYPT",
  UPLOADED: "LETS_ENCRYPT",
  NONE: "NONE",
};

/** Metadados do PR gravados no preview (lista da tela e TTL). */
export const buildPreviewMeta = (event: PullRequestEvent) => ({
  number: event.number,
  title: event.title,
  sourceBranch: event.sourceBranch,
  targetBranch: event.targetBranch,
  headSha: event.headSha,
  author: event.author ?? null,
  url: event.url ?? null,
});

/**
 * Campos do `sourceConfig` da origem que o preview NÃO herda: domínio e build
 * args são remontados; réplicas furariam a cota (que contou NANO com uma);
 * o marcador do capiva.json descreve o último deploy da ORIGEM; gatilho e
 * padrão de tag não valem com o deploy por push desligado.
 */
const stripCamposDaOrigem = (sourceConfig: unknown): Record<string, unknown> => {
  const {
    domain: _domain,
    previews: _previews,
    buildArgs: _buildArgs,
    replicas: _replicas,
    capivaJson: _capivaJson,
    deployTrigger: _deployTrigger,
    tagPattern: _tagPattern,
    ...cfg
  } = (sourceConfig ?? {}) as Record<string, unknown>;
  return cfg;
};

/**
 * Cópia da aplicação de origem para o PR. Mesmo projeto e ambiente (o nome
 * `pr-<n>-` evita colisão no namespace), branch do PR, perfil NANO, uma réplica
 * e sem HPA (a ScalingPolicy não é copiada). O deploy por push fica DESLIGADO:
 * quem redeploya é o evento `synchronized` do PR, senão cada push na branch do
 * PR geraria dois deploys.
 */
export const buildPreviewInput = (
  origem: Application,
  event: PullRequestEvent,
  settings: PreviewSettings,
): CreateApplicationInput => {
  const cfg = stripCamposDaOrigem(origem.sourceConfig);
  const { buildArgs } = (origem.sourceConfig ?? {}) as Record<string, unknown>;
  const name = buildPreviewName(event.number, origem.name);
  const host = buildPreviewHost(name, settings.domain);
  const tags = Array.isArray(origem.tags) ? origem.tags.map(String) : [];

  return {
    projectId: origem.projectId,
    environmentId: origem.environmentId,
    name,
    source: origem.source,
    gitConnectionId: origem.gitConnectionId ?? undefined,
    sourceConfig: {
      ...cfg,
      branch: event.sourceBranch,
      autoDeploy: false,
      previews: { enabled: false },
      preview: buildPreviewMeta(event),
      ...(host ? { domain: host } : {}),
    },
    buildArgs: Array.isArray(buildArgs) ? (buildArgs as { key: string; value: string }[]) : [],
    profile: "NANO",
    rolloutStrategy: "ROLLING",
    port: origem.port ?? 3000,
    tags: [...tags, "preview"],
    tlsMode: PREVIEW_TLS_MODE[origem.tlsMode] ?? "LETS_ENCRYPT",
    registryId: origem.registryId ?? undefined,
    previewOf: { applicationId: origem.id, prNumber: event.number },
  };
};
