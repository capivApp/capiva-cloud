import { resolveResources } from "@infra/kubernetes/profiles";
import type { K8sManifest } from "@interface/integrations";

/**
 * Fábricas de manifests Kubernetes. Tudo o que o usuário NÃO vê é gerado aqui:
 * Deployment/Rollout, Service, HTTPRoute (Gateway API), HPA, CronJob,
 * CloudNativePG Cluster. Mantém os reconcilers enxutos e testáveis.
 */
const labels = (name: string) => ({ "app.kubernetes.io/name": name, "app.kubernetes.io/part-of": "capiva" });

export interface AppManifestInput {
  name: string;
  namespace: string;
  image: string;
  port: number;
  profile: string;
  customResources?: Record<string, unknown> | null;
  /** Caminho do health check (readiness). Default "/". */
  healthPath?: string;
  envVars?: { key: string; value: string }[];
  /** volumes montados: claimName = <app>-<volName>. RWX → mesma pasta em todos os pods. */
  volumes?: { name: string; mountPath: string }[];
  /** registry privado → imagePullSecrets */
  imagePullSecret?: string;
}

/** Monta volumeMounts (container) e volumes (pod) a partir dos volumes da app. */
function volumeBits(input: AppManifestInput) {
  const vols = input.volumes ?? [];
  return {
    volumeMounts: vols.map((v) => ({ name: v.name, mountPath: v.mountPath })),
    volumes: vols.map((v) => ({ name: v.name, persistentVolumeClaim: { claimName: `${input.name}-${v.name}` } })),
    imagePullSecrets: input.imagePullSecret ? [{ name: input.imagePullSecret }] : undefined,
  };
}

/**
 * StorageClass por modo de acesso. RWX (pasta compartilhada entre pods) usa
 * Longhorn por padrão (share-manager). Ambos são configuráveis por env para
 * clusters de dev sem Longhorn (ex.: RWO=local-path, RWX=nfs).
 */
function storageClassFor(accessMode: "RWO" | "RWX"): string {
  if (accessMode === "RWX") return process.env.CAPIVA_STORAGE_CLASS_RWX || "longhorn";
  return process.env.CAPIVA_STORAGE_CLASS || "longhorn";
}

/** PVC de um volume da aplicação. RWX usa Longhorn (share-manager). */
export function pvcManifest(claimName: string, namespace: string, sizeGi: number, accessMode: "RWO" | "RWX"): K8sManifest {
  return {
    apiVersion: "v1",
    kind: "PersistentVolumeClaim",
    metadata: { name: claimName, namespace, labels: { "app.kubernetes.io/part-of": "capiva" } },
    spec: {
      accessModes: [accessMode === "RWX" ? "ReadWriteMany" : "ReadWriteOnce"],
      storageClassName: storageClassFor(accessMode),
      resources: { requests: { storage: `${sizeGi}Gi` } },
    },
  };
}

export interface KanikoBuildInput {
  name: string;
  namespace: string;
  /** contexto de build: `git://host/owner/repo.git#refs/heads/branch` ou `dir://...`. */
  context: string;
  dockerfile: string;
  imageRef: string;
  /** subpath dentro do repo (monorepo). */
  contextSubPath?: string;
  /** secret de credenciais do registro de destino (docker config json). */
  pushSecret?: string;
  buildArgs?: { key: string; value: string }[];
}

/**
 * Job Kaniko — build de imagem in-cluster (sem Docker daemon) a partir de um
 * repositório Git, publicando no registry de destino. Abstrai o pipeline de
 * build: o usuário só escolhe a origem; a plataforma gera e executa este Job.
 */
export function kanikoJobManifest(input: KanikoBuildInput): K8sManifest {
  const args = [
    `--context=${input.context}`,
    `--dockerfile=${input.dockerfile}`,
    `--destination=${input.imageRef}`,
    ...(input.contextSubPath ? [`--context-sub-path=${input.contextSubPath}`] : []),
    ...(input.pushSecret ? [] : ["--no-push"]),
    ...(input.buildArgs ?? []).map((a) => `--build-arg=${a.key}=${a.value}`),
  ];
  const mountSecret = input.pushSecret
    ? { volumeMounts: [{ name: "docker-config", mountPath: "/kaniko/.docker" }] }
    : {};
  const secretVolume = input.pushSecret
    ? { volumes: [{ name: "docker-config", secret: { secretName: input.pushSecret, items: [{ key: ".dockerconfigjson", path: "config.json" }] } }] }
    : {};
  return {
    apiVersion: "batch/v1",
    kind: "Job",
    metadata: { name: input.name, namespace: input.namespace, labels: labels(input.name) },
    spec: {
      backoffLimit: 0,
      ttlSecondsAfterFinished: 300,
      template: {
        metadata: { labels: labels(input.name) },
        spec: {
          restartPolicy: "Never",
          containers: [
            {
              name: "kaniko",
              image: process.env.CAPIVA_KANIKO_IMAGE || "gcr.io/kaniko-project/executor:latest",
              args,
              ...mountSecret,
            },
          ],
          ...secretVolume,
        },
      },
    },
  };
}

/** Deployment (estratégia Rolling). Para Blue/Green e Canary usa-se Rollout (Argo). */
/**
 * Deployment da app. `replicas = null` omite o campo (deixa o HPA ser o dono
 * das réplicas, evitando conflito de server-side apply com o autoscaler).
 */
export function deploymentManifest(input: AppManifestInput, replicas: number | null = 2): K8sManifest {
  const res = resolveResources(input.profile, input.customResources);
  return {
    apiVersion: "apps/v1",
    kind: "Deployment",
    metadata: { name: input.name, namespace: input.namespace, labels: labels(input.name) },
    spec: {
      ...(replicas === null ? {} : { replicas }),
      selector: { matchLabels: labels(input.name) },
      template: {
        metadata: { labels: labels(input.name) },
        spec: {
          ...(volumeBits(input).imagePullSecrets ? { imagePullSecrets: volumeBits(input).imagePullSecrets } : {}),
          containers: [
            {
              name: input.name,
              image: input.image,
              ports: [{ containerPort: input.port }],
              resources: { requests: res, limits: res },
              env: (input.envVars ?? []).map((e) => ({ name: e.key, value: e.value })),
              volumeMounts: volumeBits(input).volumeMounts,
              readinessProbe: { httpGet: { path: input.healthPath || "/", port: input.port }, initialDelaySeconds: 5, periodSeconds: 10 },
            },
          ],
          volumes: volumeBits(input).volumes,
        },
      },
    },
  };
}

/**
 * AnalysisTemplate (Argo Rollouts) — análise automática de erro/latência durante
 * o rollout. Falha → rollback automático. Abstraído (usuário só liga "rollback
 * automático"). Usa Prometheus do cluster; o address é o padrão do kube-prometheus.
 */
export function analysisTemplateManifest(name: string, namespace: string): K8sManifest {
  const promAddress = process.env.PROMETHEUS_URL || "http://prometheus-operated.monitoring:9090";
  return {
    apiVersion: "argoproj.io/v1alpha1",
    kind: "AnalysisTemplate",
    metadata: { name: `${name}-health`, namespace, labels: labels(name) },
    spec: {
      metrics: [
        {
          name: "error-rate",
          interval: "1m",
          successCondition: "result < 0.05",
          failureLimit: 2,
          provider: {
            prometheus: {
              address: promAddress,
              query: `sum(rate(http_requests_total{app="${name}",status=~"5.."}[2m])) / sum(rate(http_requests_total{app="${name}"}[2m]))`,
            },
          },
        },
      ],
    },
  };
}

/** Rollout (Argo Rollouts) — usado para Blue/Green e Canary. Abstrai a CRD. */
export function rolloutManifest(
  input: AppManifestInput,
  strategy: "BLUE_GREEN" | "CANARY",
  replicas = 2,
  rolloutConfig?: Record<string, unknown> | null,
): K8sManifest {
  const res = resolveResources(input.profile, input.customResources);
  const autoRollback = rolloutConfig?.autoRollback !== false;
  const initial = Number(rolloutConfig?.initialTraffic ?? 10);
  const increment = Number(rolloutConfig?.increment ?? 20);
  const interval = `${Number(rolloutConfig?.intervalMinutes ?? 5)}m`;
  const analysis = autoRollback
    ? { analysis: { templates: [{ templateName: `${input.name}-health` }], startingStep: 1 } }
    : {};

  // Passos de canary: 10% → +incremento até 100%, pausando a cada passo.
  const steps: Record<string, unknown>[] = [];
  for (let w = initial; w < 100; w += increment) {
    steps.push({ setWeight: w });
    steps.push({ pause: { duration: interval } });
  }
  steps.push({ setWeight: 100 });

  return {
    apiVersion: "argoproj.io/v1alpha1",
    kind: "Rollout",
    metadata: { name: input.name, namespace: input.namespace, labels: labels(input.name) },
    spec: {
      replicas,
      selector: { matchLabels: labels(input.name) },
      strategy:
        strategy === "CANARY"
          ? { canary: { steps, ...analysis } }
          : {
              blueGreen: {
                activeService: input.name,
                previewService: `${input.name}-preview`,
                autoPromotionEnabled: !autoRollback,
                ...(autoRollback ? { prePromotionAnalysis: { templates: [{ templateName: `${input.name}-health` }] } } : {}),
              },
            },
      template: {
        metadata: { labels: labels(input.name) },
        spec: {
          containers: [
            {
              name: input.name,
              image: input.image,
              ports: [{ containerPort: input.port }],
              resources: { requests: res, limits: res },
              env: (input.envVars ?? []).map((e) => ({ name: e.key, value: e.value })),
            },
          ],
        },
      },
    },
  };
}

/** Worker: Deployment SEM Service nem porta (processo de background). */
export function workerManifest(
  name: string,
  namespace: string,
  image: string,
  profile: string,
  replicas: number,
  envVars: { key: string; value: string }[] = [],
): K8sManifest {
  const res = resolveResources(profile, null);
  return {
    apiVersion: "apps/v1",
    kind: "Deployment",
    metadata: { name, namespace, labels: labels(name) },
    spec: {
      replicas,
      selector: { matchLabels: labels(name) },
      template: {
        metadata: { labels: labels(name) },
        spec: {
          containers: [
            {
              name,
              image,
              resources: { requests: res, limits: res },
              env: envVars.map((e) => ({ name: e.key, value: e.value })),
            },
          ],
        },
      },
    },
  };
}

/**
 * Service: expõe a aplicação na porta 80 do cluster, encaminhando para a porta
 * ALVO em que o container escuta (targetPort). O usuário informa essa porta;
 * é o único dado de rede que não dá para adivinhar.
 */
export function serviceManifest(name: string, namespace: string, targetPort: number): K8sManifest {
  return {
    apiVersion: "v1",
    kind: "Service",
    metadata: { name, namespace, labels: labels(name) },
    spec: { selector: labels(name), ports: [{ name: "http", port: 80, targetPort }] },
  };
}

/**
 * Ingress (Traefik) — proxy reverso / load balancer da plataforma. Roteia o
 * domínio custom para o Service na porta 80. TLS automático via cert-manager
 * (Let's Encrypt) pela annotation `cert-manager.io/cluster-issuer`.
 *
 * DECISÃO: o edge da plataforma é o Traefik (IngressClass "traefik"), por ser
 * simples, self-hosted e com ACME nativo — alinhado à proposta "just works".
 */
export type TlsModeManifest = "LETS_ENCRYPT" | "UPLOADED" | "NONE";

/**
 * Longhorn Backup de um volume (snapshot → S3 backupTarget). O nome do volume
 * Longhorn é o `volumeHandle` do PV ligado ao PVC. Abstrai a CRD do Longhorn.
 */
export function longhornBackupManifest(name: string, longhornVolume: string): K8sManifest {
  return {
    apiVersion: "longhorn.io/v1beta2",
    kind: "Backup",
    metadata: { name, namespace: "longhorn-system", labels: { "app.kubernetes.io/part-of": "capiva" } },
    spec: { snapshotName: name, labels: { "capiva.backup": name } },
    // O controller do Longhorn associa o Backup ao volume via label/owner; aqui
    // mantemos o vínculo explícito para reconciliação/observação.
    status: { volumeName: longhornVolume },
  };
}

/** Configura o destino de backup do Longhorn (S3) a partir de um StorageProvider. */
export function longhornBackupTargetSecretManifest(
  name: string,
  s3: { accessKeyId: string; secretAccessKey: string; endpoint: string },
): K8sManifest {
  return {
    apiVersion: "v1",
    kind: "Secret",
    metadata: { name, namespace: "longhorn-system", labels: { "app.kubernetes.io/part-of": "capiva" } },
    type: "Opaque",
    data: {
      AWS_ACCESS_KEY_ID: Buffer.from(s3.accessKeyId).toString("base64"),
      AWS_SECRET_ACCESS_KEY: Buffer.from(s3.secretAccessKey).toString("base64"),
      AWS_ENDPOINTS: Buffer.from(s3.endpoint).toString("base64"),
    },
  };
}

/** Secret `kubernetes.io/dockerconfigjson` (imagePullSecret) de um registry privado. */
export function dockerConfigSecretManifest(
  name: string,
  namespace: string,
  registry: { url: string; username: string; password: string },
): K8sManifest {
  const auth = Buffer.from(`${registry.username}:${registry.password}`).toString("base64");
  const dockerconfig = { auths: { [registry.url]: { username: registry.username, password: registry.password, auth } } };
  return {
    apiVersion: "v1",
    kind: "Secret",
    type: "kubernetes.io/dockerconfigjson",
    metadata: { name, namespace, labels: labels(name) },
    data: { ".dockerconfigjson": Buffer.from(JSON.stringify(dockerconfig)).toString("base64") },
  };
}

/** Secret `kubernetes.io/tls` a partir de um certificado enviado (PEM cert+key). */
export function tlsSecretManifest(name: string, namespace: string, certPem: string, keyPem: string): K8sManifest {
  return {
    apiVersion: "v1",
    kind: "Secret",
    type: "kubernetes.io/tls",
    metadata: { name: `${name}-tls`, namespace, labels: labels(name) },
    data: {
      "tls.crt": Buffer.from(certPem).toString("base64"),
      "tls.key": Buffer.from(keyPem).toString("base64"),
    },
  };
}

/**
 * Ingress (Traefik) com TLS flexível por deploy/domínio:
 *  - `LETS_ENCRYPT`: annotation cert-manager + bloco tls (Secret gerado pelo ACME).
 *  - `UPLOADED`: bloco tls apontando para o Secret `<name>-tls` (cert enviado).
 *  - `NONE`: sem tls, entrypoint `web` (porta 80).
 */
/**
 * Nome DNS-1123 estável para o Ingress de um domínio adicional de uma app:
 * `<app>-<host-slug>`, truncado a 253 chars. Determinístico (idempotente e
 * permite remover o Ingress exato ao apagar o domínio).
 */
export function ingressNameFor(appName: string, host: string): string {
  const slug = host.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${appName}-${slug}`.slice(0, 253);
}

/**
 * Ingress (Traefik) com TLS flexível por deploy/domínio:
 *  - `LETS_ENCRYPT`: annotation cert-manager + bloco tls (Secret gerado pelo ACME).
 *  - `UPLOADED`: bloco tls apontando para o Secret tls (cert enviado).
 *  - `NONE`: sem tls, entrypoint `web` (porta 80).
 *
 * `serviceName` (default = `name`) é o Service alvo; em domínios adicionais o
 * Ingress tem nome próprio mas aponta para o Service da app. `tlsSecretName`
 * (default `${name}-tls`) permite um Secret por domínio.
 */
export function ingressManifest(
  name: string,
  namespace: string,
  host: string,
  tlsMode: TlsModeManifest = "LETS_ENCRYPT",
  opts: { serviceName?: string; tlsSecretName?: string } = {},
): K8sManifest {
  const serviceName = opts.serviceName ?? name;
  const tlsSecretName = opts.tlsSecretName ?? `${name}-tls`;
  const rules = [
    { host, http: { paths: [{ path: "/", pathType: "Prefix", backend: { service: { name: serviceName, port: { number: 80 } } } }] } },
  ];

  if (tlsMode === "NONE") {
    return {
      apiVersion: "networking.k8s.io/v1",
      kind: "Ingress",
      metadata: { name, namespace, labels: labels(name), annotations: { "traefik.ingress.kubernetes.io/router.entrypoints": "web" } },
      spec: { ingressClassName: "traefik", rules },
    };
  }

  const annotations: Record<string, string> = { "traefik.ingress.kubernetes.io/router.entrypoints": "websecure" };
  if (tlsMode === "LETS_ENCRYPT") annotations["cert-manager.io/cluster-issuer"] = process.env.CERT_ISSUER || "letsencrypt-prod";

  return {
    apiVersion: "networking.k8s.io/v1",
    kind: "Ingress",
    metadata: { name, namespace, labels: labels(name), annotations },
    spec: {
      ingressClassName: "traefik",
      tls: [{ hosts: [host], secretName: tlsSecretName }],
      rules,
    },
  };
}

export function hpaManifest(
  name: string,
  namespace: string,
  min: number,
  max: number,
  metric: "CPU" | "MEMORY" | "REQUESTS",
  target: number,
): K8sManifest {
  // REQUESTS usa métrica de Pods (req/s) — requer prometheus-adapter no cluster.
  // CPU/MEMORY usam Resource utilization (metrics-server).
  const metrics =
    metric === "REQUESTS"
      ? [{ type: "Pods", pods: { metric: { name: "http_requests_per_second" }, target: { type: "AverageValue", averageValue: String(target) } } }]
      : [{ type: "Resource", resource: { name: metric === "MEMORY" ? "memory" : "cpu", target: { type: "Utilization", averageUtilization: target } } }];

  return {
    apiVersion: "autoscaling/v2",
    kind: "HorizontalPodAutoscaler",
    metadata: { name, namespace, labels: labels(name) },
    spec: {
      scaleTargetRef: { apiVersion: "apps/v1", kind: "Deployment", name },
      minReplicas: min,
      maxReplicas: max,
      metrics,
    },
  };
}

/**
 * NetworkPolicy: default-deny de ingress, liberando APENAS as origens declaradas
 * no grafo de dependências (isolamento entre serviços). Gerada a partir das
 * dependências — o usuário nunca escreve policy.
 */
export function networkPolicyManifest(name: string, namespace: string, allowedFrom: string[]): K8sManifest {
  const from = allowedFrom.map((src) => ({ podSelector: { matchLabels: { "app.kubernetes.io/name": src } } }));
  return {
    apiVersion: "networking.k8s.io/v1",
    kind: "NetworkPolicy",
    metadata: { name: `${name}-allow`, namespace, labels: labels(name) },
    spec: {
      podSelector: { matchLabels: { "app.kubernetes.io/name": name } },
      policyTypes: ["Ingress"],
      // Sem origens declaradas → nenhuma regra de ingress = default-deny.
      ingress: from.length ? [{ from }] : [],
    },
  };
}

export function cronJobManifest(name: string, namespace: string, schedule: string, image: string, profile: string): K8sManifest {
  const res = resolveResources(profile, null);
  return {
    apiVersion: "batch/v1",
    kind: "CronJob",
    metadata: { name, namespace, labels: labels(name) },
    spec: {
      schedule,
      jobTemplate: {
        spec: {
          template: {
            spec: {
              restartPolicy: "OnFailure",
              containers: [{ name, image, resources: { requests: res, limits: res } }],
            },
          },
        },
      },
    },
  };
}

/** CloudNativePG Cluster — Postgres single/HA. Abstrai StatefulSet/Patroni/failover. */
export function postgresClusterManifest(name: string, namespace: string, size: string, ha: boolean): K8sManifest {
  const storage = size === "LARGE" ? "100Gi" : size === "MEDIUM" ? "50Gi" : "10Gi";
  return {
    apiVersion: "postgresql.cnpg.io/v1",
    kind: "Cluster",
    metadata: { name, namespace, labels: labels(name) },
    spec: {
      instances: ha ? 3 : 1,
      storage: { size: storage },
      ...(ha ? { primaryUpdateStrategy: "unsupervised" } : {}),
    },
  };
}
