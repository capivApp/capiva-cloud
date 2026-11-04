import { resolveResources } from "@infra/kubernetes/profiles";
import type { K8sManifest } from "@interface/integrations";

/**
 * Fábricas de manifests Kubernetes. Tudo o que o usuário NÃO vê é gerado aqui:
 * Deployment/Rollout, Service, HTTPRoute (Gateway API), HPA, CronJob,
 * CloudNativePG Cluster. Mantém os reconcilers enxutos e testáveis.
 */
const labels = (name: string) => ({
  "app.kubernetes.io/name": name,
  "app.kubernetes.io/part-of": "capiva",
});

/** Variável do container: valor literal ou referência a um Secret (cofre externo). */
export interface ContainerEnvVar {
  key: string;
  value: string;
  secretRef?: { name: string; key: string };
}

const containerEnv = (e: ContainerEnvVar) =>
  e.secretRef
    ? { name: e.key, valueFrom: { secretKeyRef: e.secretRef } }
    : { name: e.key, value: e.value };

export interface AppManifestInput {
  name: string;
  namespace: string;
  image: string;
  port: number;
  profile: string;
  customResources?: Record<string, unknown> | null;
  /** Caminho do health check (readiness). Default "/". */
  healthPath?: string;
  envVars?: ContainerEnvVar[];
  /** volumes montados: claimName = <app>-<volName>. RWX → mesma pasta em todos os pods. */
  volumes?: { name: string; mountPath: string }[];
  /** registry privado → imagePullSecrets */
  imagePullSecret?: string;
}

/**
 * Readiness probe. Sem `healthPath` definido, usa um check TCP (porta aberta =
 * pronto) — tolerante a apps que não respondem 200 em "/". Com `healthPath`,
 * faz HTTP GET nesse caminho. Evita o deploy travar em "Implantando" por um
 * health check HTTP que o usuário nunca configurou.
 */
function probeTarget(input: AppManifestInput) {
  return input.healthPath
    ? { httpGet: { path: input.healthPath, port: input.port } }
    : { tcpSocket: { port: input.port } };
}

function readinessProbe(input: AppManifestInput) {
  return { ...probeTarget(input), initialDelaySeconds: 5, periodSeconds: 10, failureThreshold: 3 };
}

/**
 * Liveness probe. Só a readiness tira o pod do Service — um processo travado
 * (deadlock, event loop preso) continua "não pronto" para sempre e ninguém o
 * reinicia. Os limiares são deliberadamente mais frouxos que os da readiness:
 * um falso positivo aqui MATA o container, então preferimos demorar a agir.
 */
function livenessProbe(input: AppManifestInput) {
  return {
    ...probeTarget(input),
    initialDelaySeconds: 30,
    periodSeconds: 20,
    timeoutSeconds: 5,
    failureThreshold: 6,
  };
}

/**
 * Espalha as réplicas entre nós (e zonas, quando o cluster rotula). `ScheduleAnyway`
 * mantém o comportamento de "melhor esforço": em cluster de nó único a app sobe
 * do mesmo jeito, em vez de ficar Pending — o objetivo é resiliência, não uma
 * restrição rígida que quebre ambientes pequenos.
 */
function topologySpreadConstraints(name: string) {
  const selector = { matchLabels: labels(name) };
  return [
    {
      maxSkew: 1,
      topologyKey: "kubernetes.io/hostname",
      whenUnsatisfiable: "ScheduleAnyway",
      labelSelector: selector,
    },
    {
      maxSkew: 1,
      topologyKey: "topology.kubernetes.io/zone",
      whenUnsatisfiable: "ScheduleAnyway",
      labelSelector: selector,
    },
  ];
}

/**
 * PodDisruptionBudget: impede que drain de nó, upgrade de cluster ou autoscaler
 * derrubem todas as réplicas de uma vez. `maxUnavailable: 1` funciona para
 * qualquer escala — com 1 réplica o PDB não bloqueia o drain (evita nó preso).
 */
export function podDisruptionBudgetManifest(name: string, namespace: string): K8sManifest {
  return {
    apiVersion: "policy/v1",
    kind: "PodDisruptionBudget",
    metadata: { name, namespace, labels: labels(name) },
    spec: { maxUnavailable: 1, selector: { matchLabels: labels(name) } },
  };
}

/** Monta volumeMounts (container) e volumes (pod) a partir dos volumes da app. */
function volumeBits(input: AppManifestInput) {
  const vols = input.volumes ?? [];
  return {
    volumeMounts: vols.map((v) => ({ name: v.name, mountPath: v.mountPath })),
    volumes: vols.map((v) => ({
      name: v.name,
      persistentVolumeClaim: { claimName: `${input.name}-${v.name}` },
    })),
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
export function pvcManifest(
  claimName: string,
  namespace: string,
  sizeGi: number,
  accessMode: "RWO" | "RWX",
): K8sManifest {
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
  /** secret com GIT_USERNAME/GIT_PASSWORD para clonar repositório privado. */
  gitCredentialsSecret?: string;
  buildArgs?: { key: string; value: string }[];
  /** Deploy dono deste build → label `capiva.cloud/deployment` p/ buscar os logs. */
  deploymentId?: string;
  /** Publica a imagem no registry de destino. `false` → apenas build (--no-push). */
  push?: boolean;
  /** Registry HTTP/sem TLS → --insecure --skip-tls-verify (push e pull). */
  insecure?: boolean;
  /** Protocolo de clone do contexto Git (default do Kaniko é https). */
  gitPullMethod?: "http" | "https";
  /**
   * Contexto preparado por initContainers (clone + gerador de Dockerfile) num
   * emptyDir montado em `/workspace`. Usado com `context: dir:///workspace/...`.
   */
  workspace?: { initContainers: Record<string, unknown>[] };
}

/**
 * Build sem teto compete com as aplicações do mesmo nó. O request é modesto (o Job
 * só precisa ser agendado) e o limit contém o pico. Vale para todo Job de build.
 */
export function buildResources() {
  return {
    requests: {
      cpu: process.env.CAPIVA_BUILD_CPU_REQUEST || "250m",
      memory: process.env.CAPIVA_BUILD_MEMORY_REQUEST || "512Mi",
    },
    limits: {
      cpu: process.env.CAPIVA_BUILD_CPU_LIMIT || "2",
      memory: process.env.CAPIVA_BUILD_MEMORY_LIMIT || "4Gi",
    },
  };
}

/** Volume `docker-config` com o `config.json` do registry de destino (secret de push). */
export function dockerConfigVolume(pushSecret: string) {
  return {
    name: "docker-config",
    secret: { secretName: pushSecret, items: [{ key: ".dockerconfigjson", path: "config.json" }] },
  };
}

/** Casca comum dos Jobs de build (Kaniko, BuildKit, Buildpacks): labels, retries, TTL e deadline. */
export function buildJobEnvelope(
  input: { name: string; namespace: string; deploymentId?: string },
  podSpec: Record<string, unknown>,
): K8sManifest {
  // Label do deploy → permite buscar os logs do build (podLogsByLabel).
  const buildLabels = {
    ...labels(input.name),
    ...(input.deploymentId ? { "capiva.cloud/deployment": input.deploymentId } : {}),
  };
  return {
    apiVersion: "batch/v1",
    kind: "Job",
    metadata: { name: input.name, namespace: input.namespace, labels: buildLabels },
    spec: {
      backoffLimit: 0,
      ttlSecondsAfterFinished: 300,
      // Build travado (rede, registry inacessível) segura um pod e as reservas
      // do nó indefinidamente — o deadline encerra o Job.
      activeDeadlineSeconds: Number(process.env.CAPIVA_BUILD_TIMEOUT_SECONDS ?? 1800),
      template: { metadata: { labels: buildLabels }, spec: { restartPolicy: "Never", ...podSpec } },
    },
  };
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
    ...(input.push ? [] : ["--no-push"]),
    // Registry HTTP/sem TLS: libera push e pull inseguros.
    ...(input.insecure
      ? ["--insecure", "--skip-tls-verify", "--insecure-pull", "--skip-tls-verify-pull"]
      : []),
    ...(input.buildArgs ?? []).map((a) => `--build-arg=${a.key}=${a.value}`),
  ];
  const volumeMounts = [
    ...(input.pushSecret ? [{ name: "docker-config", mountPath: "/kaniko/.docker" }] : []),
    ...(input.workspace ? [{ name: "workspace", mountPath: "/workspace" }] : []),
  ];
  const mountSecret = volumeMounts.length ? { volumeMounts } : {};
  // Credenciais Git (repo privado): Kaniko lê GIT_USERNAME/GIT_PASSWORD do ambiente.
  // GIT_PULL_METHOD escolhe http/https para clonar o contexto Git.
  const env = input.gitPullMethod ? [{ name: "GIT_PULL_METHOD", value: input.gitPullMethod }] : [];
  const gitEnv = {
    ...(env.length ? { env } : {}),
    ...(input.gitCredentialsSecret
      ? { envFrom: [{ secretRef: { name: input.gitCredentialsSecret } }] }
      : {}),
  };
  const volumes = [
    ...(input.pushSecret ? [dockerConfigVolume(input.pushSecret)] : []),
    ...(input.workspace ? [{ name: "workspace", emptyDir: {} }] : []),
  ];
  const secretVolume = volumes.length ? { volumes } : {};
  const initContainers = input.workspace ? { initContainers: input.workspace.initContainers } : {};
  return buildJobEnvelope(input, {
    ...initContainers,
    containers: [
      {
        name: "kaniko",
        image: process.env.CAPIVA_KANIKO_IMAGE || "gcr.io/kaniko-project/executor:latest",
        args,
        resources: buildResources(),
        ...mountSecret,
        ...gitEnv,
      },
    ],
    ...secretVolume,
  });
}

/** Deployment (estratégia Rolling). Para Blue/Green e Canary usa-se Rollout (Argo). */
/**
 * Deployment da app. `replicas = null` omite o campo (deixa o HPA ser o dono
 * das réplicas, evitando conflito de server-side apply com o autoscaler).
 */
export function deploymentManifest(
  input: AppManifestInput,
  replicas: number | null = 2,
): K8sManifest {
  const bits = volumeBits(input);
  return {
    apiVersion: "apps/v1",
    kind: "Deployment",
    metadata: { name: input.name, namespace: input.namespace, labels: labels(input.name) },
    spec: {
      ...(replicas === null ? {} : { replicas }),
      selector: { matchLabels: labels(input.name) },
      // Zero-downtime de verdade: o default do Kubernetes (maxUnavailable 25%)
      // permite derrubar réplica antiga antes da nova ficar pronta.
      strategy: { type: "RollingUpdate", rollingUpdate: { maxUnavailable: 0, maxSurge: 1 } },
      // Uma réplica só é contada como disponível depois de 10s pronta — evita
      // declarar sucesso num pod que aceita conexões e morre logo em seguida.
      minReadySeconds: 10,
      revisionHistoryLimit: 5,
      template: {
        metadata: { labels: labels(input.name) },
        spec: {
          ...(bits.imagePullSecrets ? { imagePullSecrets: bits.imagePullSecrets } : {}),
          // Tempo para o processo terminar o que está em voo antes do SIGKILL.
          terminationGracePeriodSeconds: 30,
          topologySpreadConstraints: topologySpreadConstraints(input.name),
          containers: [podContainer(input)],
          volumes: bits.volumes,
        },
      },
    },
  };
}

/** Container da aplicação — compartilhado por Deployment e Rollout. */
function podContainer(input: AppManifestInput) {
  const res = resolveResources(input.profile, input.customResources);
  return {
    name: input.name,
    image: input.image,
    ports: [{ containerPort: input.port }],
    resources: { requests: res, limits: res },
    env: (input.envVars ?? []).map(containerEnv),
    volumeMounts: volumeBits(input).volumeMounts,
    readinessProbe: readinessProbe(input),
    livenessProbe: livenessProbe(input),
  };
}

/**
 * AnalysisTemplate (Argo Rollouts) — análise automática de erro/latência durante
 * o rollout. Falha → rollback automático. Abstraído (usuário só liga "rollback
 * automático"). Usa Prometheus do cluster; o address é o padrão do kube-prometheus.
 */
export function analysisTemplateManifest(name: string, namespace: string): K8sManifest {
  const promAddress = process.env.PROMETHEUS_URL || "http://prometheus-operated.monitoring:9090";
  // Seletor das séries da app. O default casa com o Service que a plataforma
  // cria (`service=<app>`) e é preso ao namespace do ambiente — antes o filtro
  // era `app="<nome>"`, label que NENHUM recurso gerado aqui aplica: a query
  // não retornava série alguma e a análise ficava sem dado.
  const selector = (
    process.env.CAPIVA_ANALYSIS_SELECTOR || 'service="{{name}}",namespace="{{namespace}}"'
  )
    .replace(/\{\{name\}\}/g, name)
    .replace(/\{\{namespace\}\}/g, namespace);

  // `or vector(0)` garante um valor mesmo sem tráfego no intervalo: sem isso a
  // query vazia é inconclusiva e o rollout trava (ou cai em rollback) em app
  // recém-criada que ainda não recebeu requisição.
  const errors = `sum(rate(http_requests_total{${selector},status=~"5.."}[2m]))`;
  const total = `sum(rate(http_requests_total{${selector}}[2m]))`;

  return {
    apiVersion: "argoproj.io/v1alpha1",
    kind: "AnalysisTemplate",
    metadata: { name: `${name}-health`, namespace, labels: labels(name) },
    spec: {
      metrics: [
        {
          name: "error-rate",
          interval: "1m",
          successCondition: "result[0] < 0.05",
          failureLimit: 2,
          provider: {
            prometheus: {
              address: promAddress,
              query: `(${errors} / clamp_min(${total}, 1)) or vector(0)`,
            },
          },
        },
      ],
    },
  };
}

/** Rollout (Argo Rollouts) — usado para Blue/Green e Canary. Abstrai a CRD. */
/**
 * Passos do canary: `initial`% → +incremento até 100%, pausando a cada passo.
 * O incremento é forçado a ser positivo: um `increment` 0 ou negativo vindo da
 * configuração do usuário travaria o processo num laço infinito.
 */
function canarySteps(
  initialTraffic: number,
  incrementBy: number,
  interval: string,
): Record<string, unknown>[] {
  const initial = Math.min(Math.max(Number.isFinite(initialTraffic) ? initialTraffic : 10, 1), 99);
  const increment = Math.min(Math.max(Number.isFinite(incrementBy) ? incrementBy : 20, 1), 100);

  const steps: Record<string, unknown>[] = [];
  for (let weight = initial; weight < 100; weight += increment) {
    steps.push({ setWeight: weight });
    steps.push({ pause: { duration: interval } });
  }
  steps.push({ setWeight: 100 });
  return steps;
}

export function rolloutManifest(
  input: AppManifestInput,
  strategy: "BLUE_GREEN" | "CANARY",
  replicas = 2,
  rolloutConfig?: Record<string, unknown> | null,
): K8sManifest {
  const bits = volumeBits(input);
  const autoRollback = rolloutConfig?.autoRollback !== false;
  const intervalMinutes = Math.max(Number(rolloutConfig?.intervalMinutes ?? 5) || 5, 1);
  const analysis = autoRollback
    ? { analysis: { templates: [{ templateName: `${input.name}-health` }], startingStep: 1 } }
    : {};

  const steps = canarySteps(
    Number(rolloutConfig?.initialTraffic ?? 10),
    Number(rolloutConfig?.increment ?? 20),
    `${intervalMinutes}m`,
  );

  return {
    apiVersion: "argoproj.io/v1alpha1",
    kind: "Rollout",
    metadata: { name: input.name, namespace: input.namespace, labels: labels(input.name) },
    spec: {
      replicas,
      selector: { matchLabels: labels(input.name) },
      minReadySeconds: 10,
      revisionHistoryLimit: 5,
      strategy:
        strategy === "CANARY"
          ? { canary: { steps, ...analysis } }
          : {
              blueGreen: {
                activeService: input.name,
                previewService: `${input.name}-preview`,
                autoPromotionEnabled: !autoRollback,
                ...(autoRollback
                  ? {
                      prePromotionAnalysis: {
                        templates: [{ templateName: `${input.name}-health` }],
                      },
                    }
                  : {}),
              },
            },
      template: {
        metadata: { labels: labels(input.name) },
        // Mesmo pod spec do Deployment: volumes, imagePullSecrets, probes e
        // espalhamento. Antes o Rollout montava um container mínimo, então
        // trocar a estratégia para Blue/Green ou Canary fazia a app perder os
        // volumes persistentes e o pull secret do registry privado.
        spec: {
          ...(bits.imagePullSecrets ? { imagePullSecrets: bits.imagePullSecrets } : {}),
          terminationGracePeriodSeconds: 30,
          topologySpreadConstraints: topologySpreadConstraints(input.name),
          containers: [podContainer(input)],
          volumes: bits.volumes,
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
    metadata: {
      name,
      namespace: "longhorn-system",
      labels: { "app.kubernetes.io/part-of": "capiva" },
    },
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
    metadata: {
      name,
      namespace: "longhorn-system",
      labels: { "app.kubernetes.io/part-of": "capiva" },
    },
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
  const dockerconfig = {
    auths: { [registry.url]: { username: registry.username, password: registry.password, auth } },
  };
  return {
    apiVersion: "v1",
    kind: "Secret",
    type: "kubernetes.io/dockerconfigjson",
    metadata: { name, namespace, labels: labels(name) },
    data: { ".dockerconfigjson": Buffer.from(JSON.stringify(dockerconfig)).toString("base64") },
  };
}

/** Secret com GIT_USERNAME/GIT_PASSWORD consumido pelo Job Kaniko (repo privado). */
export function gitCredentialsSecretManifest(
  name: string,
  namespace: string,
  username: string,
  password: string,
): K8sManifest {
  return {
    apiVersion: "v1",
    kind: "Secret",
    type: "Opaque",
    metadata: { name, namespace, labels: labels(name) },
    data: {
      GIT_USERNAME: Buffer.from(username).toString("base64"),
      GIT_PASSWORD: Buffer.from(password).toString("base64"),
    },
  };
}

/** Secret `kubernetes.io/tls` a partir de um certificado enviado (PEM cert+key). */
export function tlsSecretManifest(
  name: string,
  namespace: string,
  certPem: string,
  keyPem: string,
): K8sManifest {
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
  const slug = host
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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
    {
      host,
      http: {
        paths: [
          {
            path: "/",
            pathType: "Prefix",
            backend: { service: { name: serviceName, port: { number: 80 } } },
          },
        ],
      },
    },
  ];

  if (tlsMode === "NONE") {
    return {
      apiVersion: "networking.k8s.io/v1",
      kind: "Ingress",
      metadata: {
        name,
        namespace,
        labels: labels(name),
        annotations: { "traefik.ingress.kubernetes.io/router.entrypoints": "web" },
      },
      spec: { ingressClassName: "traefik", rules },
    };
  }

  // Roteia HTTP (web) e HTTPS (websecure): plain HTTP funciona de imediato e o
  // HTTPS passa a valer quando o certificado for emitido (evita 404 no Traefik
  // ao acessar via http:// enquanto o cert do Let's Encrypt ainda não saiu).
  const annotations: Record<string, string> = {
    "traefik.ingress.kubernetes.io/router.entrypoints": "web,websecure",
  };
  if (tlsMode === "LETS_ENCRYPT")
    annotations["cert-manager.io/cluster-issuer"] = process.env.CERT_ISSUER || "letsencrypt-prod";

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
      ? [
          {
            type: "Pods",
            pods: {
              metric: { name: "http_requests_per_second" },
              target: { type: "AverageValue", averageValue: String(target) },
            },
          },
        ]
      : [
          {
            type: "Resource",
            resource: {
              name: metric === "MEMORY" ? "memory" : "cpu",
              target: { type: "Utilization", averageUtilization: target },
            },
          },
        ];

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

export function cronJobManifest(
  name: string,
  namespace: string,
  schedule: string,
  image: string,
  profile: string,
): K8sManifest {
  const res = resolveResources(profile, null);
  return {
    apiVersion: "batch/v1",
    kind: "CronJob",
    metadata: { name, namespace, labels: labels(name) },
    spec: {
      schedule,
      // Uma execução por vez: sem isto, um job que demora mais que o intervalo
      // acumula réplicas concorrentes até esgotar o nó.
      concurrencyPolicy: "Forbid",
      // Depois de uma janela de indisponibilidade o controller dispara TODAS as
      // execuções perdidas; o deadline descarta as que já não fazem sentido.
      startingDeadlineSeconds: 120,
      successfulJobsHistoryLimit: 3,
      failedJobsHistoryLimit: 3,
      jobTemplate: {
        spec: {
          backoffLimit: 3,
          ttlSecondsAfterFinished: 86_400,
          template: {
            metadata: { labels: labels(name) },
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

/*
 * O manifest do Postgres gerenciado vive em `databaseManifests.ts`
 * (`databaseManifest("POSTGRESQL", ...)`), junto com os demais operators. Havia
 * aqui uma segunda versão, sem `bootstrap` nem `superuserSecret`, que ninguém
 * chamava — se alguém a tivesse usado, o CNPG criaria um usuário aleatório e o
 * login do usuário falharia.
 */
