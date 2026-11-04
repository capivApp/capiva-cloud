import { CapivaConfigError, type CapivaConfig } from "@schemas/capivaConfig.schema";
import type { Application, ScalingMetric } from "@prisma-generated/client";

/** Estado atual da aplicação, como a tela o vê (variáveis secretas mascaradas). */
export interface CapivaSnapshot {
  app: Pick<Application, "source" | "port" | "profile"> & { sourceConfig: unknown; previewOfId?: string | null };
  env: {
    key: string;
    value: string;
    secret: boolean;
    source: "MANUAL" | "INJECTED" | "EXTERNAL";
    secretStoreId?: string | null;
    remoteProperty?: string | null;
  }[];
  domains: { id: string; host: string }[];
  volumes: { name: string }[];
  scaling: { minReplicas: number; maxReplicas: number; metric: ScalingMetric; target: number } | null;
}

/** DTO aceito pelo `ApplicationService.patch` (o mesmo PATCH da tela). */
export type CapivaPatchDto = Partial<{
  port: number;
  profile: Application["profile"];
  replicas: number;
  healthPath: string;
  dockerfile: string;
  subPath: string;
  compose: string;
  buildCommand: string;
  startCommand: string;
}>;

export interface CapivaVolume {
  name: string;
  mountPath: string;
  sizeGi: number;
  accessMode: "RWO" | "RWX";
}

/** Variável do lote de env; `external` mantém a referência ao cofre (o replace apagaria sem ela). */
export interface CapivaEnvVar {
  key: string;
  value: string;
  secret: boolean;
  external?: { secretStoreId: string; remoteKey: string; remoteProperty: string | null };
}

/** Uma chamada a um service existente. Cada `kind` tem um executor no CapivaConfigService. */
export type CapivaAction =
  | { kind: "patch"; dto: CapivaPatchDto }
  | { kind: "buildArgs"; buildArgs: { key: string; value: string }[] }
  | { kind: "env"; vars: CapivaEnvVar[] }
  | { kind: "scaling"; policy: { minReplicas: number; maxReplicas: number; metric: ScalingMetric; target: number } }
  | { kind: "addDomain"; host: string }
  | { kind: "removeDomain"; domainId: string }
  | { kind: "addVolume"; volume: CapivaVolume };

export interface CapivaPlan {
  actions: CapivaAction[];
  /** Campos da tela que passam a ser "definidos pelo capiva.json" (somente leitura). */
  fields: string[];
  /** Variáveis declaradas pelo arquivo (as demais continuam editáveis na tela). */
  envKeys: string[];
}

type SectionResult = Partial<CapivaPlan>;

interface CapivaSectionStrategy {
  plan(config: CapivaConfig, snapshot: CapivaSnapshot): SectionResult;
}

const configOf = (snapshot: CapivaSnapshot): Record<string, unknown> => (snapshot.app.sourceConfig ?? {}) as Record<string, unknown>;

/** Campo do PATCH: onde está no arquivo e onde está hoje na aplicação. */
interface PatchField {
  dtoKey: keyof CapivaPatchDto;
  read(config: CapivaConfig): unknown;
  current(snapshot: CapivaSnapshot): unknown;
}

const PATCH_FIELDS: PatchField[] = [
  { dtoKey: "port", read: (c) => c.port, current: (s) => s.app.port },
  { dtoKey: "profile", read: (c) => c.profile, current: (s) => s.app.profile },
  { dtoKey: "replicas", read: (c) => c.replicas, current: (s) => configOf(s).replicas },
  { dtoKey: "healthPath", read: (c) => c.healthcheck?.path, current: (s) => configOf(s).healthPath },
  { dtoKey: "dockerfile", read: (c) => c.build?.dockerfile, current: (s) => configOf(s).dockerfile },
  { dtoKey: "subPath", read: (c) => c.build?.context, current: (s) => configOf(s).subPath },
  { dtoKey: "compose", read: (c) => c.build?.compose, current: (s) => configOf(s).compose },
  { dtoKey: "buildCommand", read: (c) => c.build?.buildCommand, current: (s) => configOf(s).buildCommand },
  { dtoKey: "startCommand", read: (c) => c.build?.startCommand, current: (s) => configOf(s).startCommand },
];

/** Campos simples: um único PATCH com o que mudou. */
const patchSectionOf = (fields: PatchField[]): CapivaSectionStrategy => ({
  plan(config, snapshot) {
    const declared = fields.filter((f) => f.read(config) !== undefined);
    const changed = declared.filter((f) => f.read(config) !== f.current(snapshot));
    const dto = Object.fromEntries(changed.map((f) => [f.dtoKey, f.read(config)])) as CapivaPatchDto;
    return {
      fields: declared.map((f) => f.dtoKey),
      actions: changed.length ? [{ kind: "patch", dto }] : [],
    };
  },
});

const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Build args: o arquivo substitui a lista inteira. */
const buildArgsSection: CapivaSectionStrategy = {
  plan(config, snapshot) {
    const args = config.build?.args;
    if (!args) return {};
    const buildArgs = Object.entries(args).map(([key, value]) => ({ key, value }));
    const changed = !sameJson(buildArgs, configOf(snapshot).buildArgs ?? []);
    return { fields: ["buildArgs"], actions: changed ? [{ kind: "buildArgs", buildArgs }] : [] };
  },
};

/**
 * Variáveis: o arquivo vence nas chaves que declara; as demais variáveis MANUAL da
 * tela ficam como estão. Segredo vai com valor vazio, que o EnvVarService entende
 * como "mantém o cifrado atual". INJECTED (dependências) nunca entra no lote.
 */
const envSection: CapivaSectionStrategy = {
  plan(config, snapshot) {
    const declared = config.env;
    if (!declared) return {};
    const manual = snapshot.env.filter((v) => v.source === "MANUAL");
    const isUnchanged = (key: string, value: string) => manual.some((v) => v.key === key && !v.secret && v.value === value);
    const changed = Object.entries(declared).some(([key, value]) => !isUnchanged(key, value));
    const kept = manual.map((v) => ({ key: v.key, value: declared[v.key] ?? v.value, secret: declared[v.key] === undefined && v.secret }));
    const added = Object.entries(declared)
      .filter(([key]) => !manual.some((v) => v.key === key))
      .map(([key, value]) => ({ key, value, secret: false }));
    // Do cofre externo: fica como está, salvo se o arquivo declarar a mesma chave.
    const fromVault: CapivaEnvVar[] = snapshot.env
      .filter((v) => v.source === "EXTERNAL" && v.secretStoreId && declared[v.key] === undefined)
      .map((v) => ({
        key: v.key,
        value: v.value,
        secret: v.secret,
        external: { secretStoreId: v.secretStoreId!, remoteKey: v.value, remoteProperty: v.remoteProperty ?? null },
      }));
    return {
      fields: ["env"],
      envKeys: Object.keys(declared),
      actions: changed ? [{ kind: "env", vars: [...kept, ...fromVault, ...added] }] : [],
    };
  },
};

const scalingSection: CapivaSectionStrategy = {
  plan(config, snapshot) {
    const autoscaling = config.autoscaling;
    if (!autoscaling) return {};
    const policy = { minReplicas: autoscaling.min, maxReplicas: autoscaling.max, metric: autoscaling.metric, target: autoscaling.target };
    const changed = !snapshot.scaling || !sameJson(policy, pickPolicy(snapshot.scaling));
    return { fields: ["scaling"], actions: changed ? [{ kind: "scaling", policy }] : [] };
  },
};

const pickPolicy = (p: NonNullable<CapivaSnapshot["scaling"]>) => ({
  minReplicas: p.minReplicas,
  maxReplicas: p.maxReplicas,
  metric: p.metric,
  target: p.target,
});

/** Domínios: a lista do arquivo é a lista inteira (adiciona os novos, remove os que sumiram). */
const domainsSection: CapivaSectionStrategy = {
  plan(config, snapshot) {
    if (!config.domains) return {};
    const hosts = [...new Set(config.domains.map((h) => h.toLowerCase()))];
    const existing = new Set(snapshot.domains.map((d) => d.host.toLowerCase()));
    const toAdd = hosts.filter((h) => !existing.has(h)).map((host): CapivaAction => ({ kind: "addDomain", host }));
    const toRemove = snapshot.domains
      .filter((d) => !hosts.includes(d.host.toLowerCase()))
      .map((d): CapivaAction => ({ kind: "removeDomain", domainId: d.id }));
    return { fields: ["domains"], actions: [...toAdd, ...toRemove] };
  },
};

/**
 * Volumes: cria os que faltam. Remover está fora de propósito: apagar um volume
 * porque sumiu do arquivo destruiria dados.
 */
const volumesSection: CapivaSectionStrategy = {
  plan(config, snapshot) {
    if (!config.volumes) return {};
    const existing = new Set(snapshot.volumes.map((v) => v.name));
    const actions = config.volumes
      .filter((v) => !existing.has(v.name))
      .map((volume): CapivaAction => ({ kind: "addVolume", volume }));
    return { fields: ["volumes"], actions };
  },
};

/** O preview roda no perfil mínimo, com uma réplica: estes campos da origem não valem nele. */
const PREVIEW_FIXED_FIELDS = new Set<keyof CapivaPatchDto>(["profile", "replicas"]);

type CapivaAppKind = "application" | "preview";

/**
 * Seções por tipo de aplicação, na ordem de aplicação: build, runtime, rede. O preview
 * lê o capiva.json da ORIGEM: domínios tentariam tomar os hosts dela (domínio em uso) e
 * apagar o `pr-N`; autoscaling, perfil e réplicas tirariam o preview do perfil mínimo.
 */
const SECTIONS_BY_KIND: Record<CapivaAppKind, CapivaSectionStrategy[]> = {
  application: [patchSectionOf(PATCH_FIELDS), buildArgsSection, envSection, scalingSection, domainsSection, volumesSection],
  preview: [patchSectionOf(PATCH_FIELDS.filter((f) => !PREVIEW_FIXED_FIELDS.has(f.dtoKey))), buildArgsSection, envSection, volumesSection],
};

const kindOf = (snapshot: CapivaSnapshot): CapivaAppKind => (snapshot.app.previewOfId ? "preview" : "application");

const requireMesmaOrigem = (config: CapivaConfig, snapshot: CapivaSnapshot): void => {
  const declared = config.build?.type;
  if (!declared || declared === snapshot.app.source) return;
  throw new CapivaConfigError(`capiva.json inválido: build.type é ${declared}, mas a aplicação usa ${snapshot.app.source}.`);
};

/**
 * Merge de precedência: o arquivo vence a tela nos campos que declara. Só vira ação
 * o que difere do estado atual, para um deploy sem mudança no arquivo não
 * reconciliar nada a mais.
 */
export function planCapivaConfig(config: CapivaConfig, snapshot: CapivaSnapshot): CapivaPlan {
  requireMesmaOrigem(config, snapshot);
  const results = SECTIONS_BY_KIND[kindOf(snapshot)].map((section) => section.plan(config, snapshot));
  return {
    actions: results.flatMap((r) => r.actions ?? []),
    fields: results.flatMap((r) => r.fields ?? []),
    envKeys: results.flatMap((r) => r.envKeys ?? []),
  };
}
