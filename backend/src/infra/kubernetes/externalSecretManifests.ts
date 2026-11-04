import type { K8sManifest } from "@interface/integrations";

/**
 * Manifests do External Secrets Operator. O cofre da organização vira um
 * `SecretStore` NAMESPACED no namespace do ambiente (nunca `ClusterSecretStore`):
 * o cluster é compartilhado entre organizações e um store de cluster ficaria
 * visível a qualquer namespace. As credenciais do cofre vão num Secret ao lado.
 */
export const SECRET_STORE_PROVIDERS = ["AWS_SECRETS_MANAGER", "VAULT", "GCP_SECRET_MANAGER"] as const;
export type SecretStoreProviderKind = (typeof SECRET_STORE_PROVIDERS)[number];

const ESO_API_VERSION = "external-secrets.io/v1";
const LABELS = { "app.kubernetes.io/part-of": "capiva" };

export interface SecretStoreManifestInput {
  storeId: string;
  namespace: string;
  provider: SecretStoreProviderKind;
  config: Record<string, string | undefined>;
  credentials: Record<string, string | undefined>;
}

/** Variável da aplicação que vem do cofre externo (`chave` + `propriedade` opcional). */
export interface ExternalEnvEntry {
  envKey: string;
  storeId: string;
  remoteKey: string;
  property?: string | null;
}

interface SecretStoreProviderStrategy {
  credentialsData(credentials: SecretStoreManifestInput["credentials"]): Record<string, string>;
  provider(config: SecretStoreManifestInput["config"], authSecret: string): Record<string, unknown>;
}

const secretKey = (name: string, key: string) => ({ name, key });

/** Strategy por provedor: o formato do bloco `provider` e as chaves do Secret de credenciais. */
const PROVIDER_STRATEGIES: Record<SecretStoreProviderKind, SecretStoreProviderStrategy> = {
  AWS_SECRETS_MANAGER: {
    credentialsData: (c) => ({ "access-key-id": c.accessKeyId ?? "", "secret-access-key": c.secretAccessKey ?? "" }),
    provider: (config, auth) => ({
      aws: {
        service: "SecretsManager",
        region: config.region,
        auth: {
          secretRef: {
            accessKeyIDSecretRef: secretKey(auth, "access-key-id"),
            secretAccessKeySecretRef: secretKey(auth, "secret-access-key"),
          },
        },
      },
    }),
  },
  VAULT: {
    credentialsData: (c) => ({ token: c.token ?? "" }),
    provider: (config, auth) => ({
      vault: {
        server: config.server,
        path: config.path,
        version: config.version || "v2",
        auth: { tokenSecretRef: secretKey(auth, "token") },
      },
    }),
  },
  GCP_SECRET_MANAGER: {
    credentialsData: (c) => ({ "secret-access-credentials": c.serviceAccountJson ?? "" }),
    provider: (config, auth) => ({
      gcpsm: {
        projectID: config.projectId,
        auth: { secretRef: { secretAccessKeySecretRef: secretKey(auth, "secret-access-credentials") } },
      },
    }),
  },
};

export function secretStoreResourceName(storeId: string): string {
  return `capiva-store-${storeId.toLowerCase()}`;
}

export function externalSecretName(app: string): string {
  return `${app}-external`;
}

const storeRef = (storeId: string) => ({ name: secretStoreResourceName(storeId), kind: "SecretStore" });

/** [Secret de credenciais, SecretStore], nessa ordem: o store referencia o Secret. */
export function secretStoreManifests(input: SecretStoreManifestInput): K8sManifest[] {
  const strategy = PROVIDER_STRATEGIES[input.provider];
  const name = secretStoreResourceName(input.storeId);
  const authSecret = `${name}-auth`;
  return [
    {
      apiVersion: "v1",
      kind: "Secret",
      metadata: { name: authSecret, namespace: input.namespace, labels: LABELS },
      type: "Opaque",
      stringData: strategy.credentialsData(input.credentials),
    },
    {
      apiVersion: ESO_API_VERSION,
      kind: "SecretStore",
      metadata: { name, namespace: input.namespace, labels: LABELS },
      spec: { provider: strategy.provider(input.config, authSecret) },
    },
  ];
}

const remoteRef = (entry: ExternalEnvEntry) => ({
  key: entry.remoteKey,
  ...(entry.property ? { property: entry.property } : {}),
});

/**
 * Um ExternalSecret por aplicação. Cada entrada aponta o próprio cofre
 * (`sourceRef.storeRef`), então variáveis de cofres diferentes convivem no mesmo
 * Secret. `creationPolicy: Owner`: apagar o ExternalSecret apaga o Secret.
 */
export function externalSecretManifest(
  app: string,
  namespace: string,
  entries: ExternalEnvEntry[],
  refreshInterval = "1h",
): K8sManifest {
  const name = externalSecretName(app);
  return {
    apiVersion: ESO_API_VERSION,
    kind: "ExternalSecret",
    metadata: { name, namespace, labels: { ...LABELS, "app.kubernetes.io/name": app } },
    spec: {
      refreshInterval,
      secretStoreRef: storeRef(entries[0]?.storeId ?? ""),
      target: { name, creationPolicy: "Owner" },
      data: entries.map((entry) => ({
        secretKey: entry.envKey,
        remoteRef: remoteRef(entry),
        sourceRef: { storeRef: storeRef(entry.storeId) },
      })),
    },
  };
}

/** Variável do container que lê o Secret sincronizado pelo ExternalSecret. */
export function externalEnvVar(app: string, envKey: string) {
  return { key: envKey, value: "", secretRef: { name: externalSecretName(app), key: envKey } };
}

/**
 * Instalação do operator via HelmChart do k3s (o controller de Helm embutido
 * baixa e instala o chart). `CAPIVA_ESO_CHART_VERSION` fixa a versão do chart.
 */
export function externalSecretsOperatorManifest(version = process.env.CAPIVA_ESO_CHART_VERSION): K8sManifest {
  return {
    apiVersion: "helm.cattle.io/v1",
    kind: "HelmChart",
    metadata: { name: "external-secrets", namespace: "kube-system", labels: LABELS },
    spec: {
      chart: "external-secrets",
      repo: "https://charts.external-secrets.io",
      ...(version ? { version } : {}),
      targetNamespace: "external-secrets",
      createNamespace: true,
      valuesContent: "installCRDs: true\n",
    },
  };
}
