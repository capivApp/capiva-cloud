import { externalEnvVar, type ExternalEnvEntry } from "@infra/kubernetes/externalSecretManifests";
import type { ContainerEnvVar } from "@infra/kubernetes/manifests";
import type { EnvVar } from "@prisma-generated/client";

export type StoredEnvVar = Pick<
  EnvVar,
  "key" | "value" | "secret" | "source" | "secretStoreId" | "remoteProperty"
>;

const isExternalWithStore = (e: StoredEnvVar) =>
  e.source === "EXTERNAL" && Boolean(e.secretStoreId);

type EnvBuilder = (
  app: string,
  e: StoredEnvVar,
  reveal: (cipher: string) => string,
) => ContainerEnvVar[];

const literal: EnvBuilder = (_app, e, reveal) => [
  { key: e.key, value: e.secret ? reveal(e.value) : e.value },
];

/**
 * Strategy por origem. Variável externa sem cofre (cofre removido) sai do
 * container: o Secret sincronizado não teria a chave e o pod não subiria.
 */
const ENV_BY_SOURCE: Record<StoredEnvVar["source"], EnvBuilder> = {
  MANUAL: literal,
  INJECTED: literal,
  EXTERNAL: (app, e) => (isExternalWithStore(e) ? [externalEnvVar(app, e.key)] : []),
};

export function buildContainerEnvVars(
  app: string,
  rows: StoredEnvVar[],
  reveal: (cipher: string) => string,
): ContainerEnvVar[] {
  return rows.flatMap((e) => ENV_BY_SOURCE[e.source](app, e, reveal));
}

export function buildExternalEnvEntries(rows: StoredEnvVar[]): ExternalEnvEntry[] {
  return rows.filter(isExternalWithStore).map((e) => ({
    envKey: e.key,
    storeId: e.secretStoreId as string,
    remoteKey: e.value,
    property: e.remoteProperty,
  }));
}
