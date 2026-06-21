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

/** PVC de um volume da aplicação. RWX usa Longhorn (share-manager). */
export function pvcManifest(claimName: string, namespace: string, sizeGi: number, accessMode: "RWO" | "RWX"): K8sManifest {
  return {
    apiVersion: "v1",
    kind: "PersistentVolumeClaim",
    metadata: { name: claimName, namespace, labels: { "app.kubernetes.io/part-of": "capiva" } },
    spec: {
      accessModes: [accessMode === "RWX" ? "ReadWriteMany" : "ReadWriteOnce"],
      storageClassName: process.env.CAPIVA_STORAGE_CLASS || "longhorn",
      resources: { requests: { storage: `${sizeGi}Gi` } },
    },
  };
}

/** Deployment (estratégia Rolling). Para Blue/Green e Canary usa-se Rollout (Argo). */
export function deploymentManifest(input: AppManifestInput, replicas = 2): K8sManifest {
  const res = resolveResources(input.profile, input.customResources);
  return {
    apiVersion: "apps/v1",
    kind: "Deployment",
    metadata: { name: input.name, namespace: input.namespace, labels: labels(input.name) },
    spec: {
      replicas,
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
              readinessProbe: { httpGet: { path: "/", port: input.port }, initialDelaySeconds: 5, periodSeconds: 10 },
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
          ...(volumeBits(input).imagePullSecrets ? { imagePullSecrets: volumeBits(input).imagePullSecrets } : {}),
          containers: [
            {
              name,
              image,
              resources: { requests: res, limits: res },
              env: envVars.map((e) => ({ name: e.key, value: e.value })),
              volumeMounts: volumeBits(input).volumeMounts,
            },
          ],
          volumes: volumeBits(input).volumes,
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
export function ingressManifest(name: string, namespace: string, host: string): K8sManifest {
  return {
    apiVersion: "networking.k8s.io/v1",
    kind: "Ingress",
    metadata: {
      name,
      namespace,
      labels: labels(name),
      annotations: {
        "cert-manager.io/cluster-issuer": process.env.CERT_ISSUER || "letsencrypt-prod",
        "traefik.ingress.kubernetes.io/router.entrypoints": "websecure",
      },
    },
    spec: {
      ingressClassName: "traefik",
      tls: [{ hosts: [host], secretName: `${name}-tls` }],
      rules: [
        {
          host,
          http: { paths: [{ path: "/", pathType: "Prefix", backend: { service: { name, port: { number: 80 } } } }] },
        },
      ],
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
  const metricName = metric === "MEMORY" ? "memory" : "cpu";
  return {
    apiVersion: "autoscaling/v2",
    kind: "HorizontalPodAutoscaler",
    metadata: { name, namespace, labels: labels(name) },
    spec: {
      scaleTargetRef: { apiVersion: "apps/v1", kind: "Deployment", name },
      minReplicas: min,
      maxReplicas: max,
      metrics: [
        { type: "Resource", resource: { name: metricName, target: { type: "Utilization", averageUtilization: target } } },
      ],
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
