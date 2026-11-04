import {
  buildTraefikSelector,
  computeErrorRate5xx,
  computePercentile,
  parseTraefikAccessLog,
  type RequestEntry,
} from "@functions/requestStats";
import type { AlertMetric } from "@interface/alerts";
import type { PodMetricUsage } from "@interface/integrations";
import type { LogLine } from "@infra/observability/LokiAdapter";

/** Aplicação avaliada: como os seletores de métrica a encontram no cluster. */
export interface AlertTarget {
  app: string;
  namespace: string;
  kubeconfig: string;
  /** Domínio primário. Sem ele não há como isolar o tráfego da app no Traefik. */
  host?: string;
}

/** Fontes de métrica que o projeto já tem (só o que as strategies usam). */
export interface AlertMetricSources {
  prometheus: { instant(query: string): Promise<number | null> };
  loki: { queryWindow(selector: string, windowMs: number): Promise<LogLine[] | null> };
  kubernetes: { topPods(kubeconfig: string, namespace?: string): Promise<PodMetricUsage[]> };
}

/**
 * Mede uma métrica na janela da regra. `null` = sem dado (fonte ausente ou sem
 * tráfego): a avaliação mantém o estado, nunca inventa um valor.
 */
export interface AlertMetricStrategy {
  measure(target: AlertTarget, windowMinutes: number): Promise<number | null>;
}

const podSelector = (t: AlertTarget) =>
  `namespace="${t.namespace}",pod=~"${t.app}-.*",container!=""`;

/** Soma o uso dos pods da aplicação no metrics-server (leitura instantânea, sem janela). */
const sumPodUsage = async (
  sources: AlertMetricSources,
  t: AlertTarget,
  pick: (p: PodMetricUsage) => number,
): Promise<number | null> => {
  const pods = (await sources.kubernetes.topPods(t.kubeconfig, t.namespace)).filter((p) =>
    p.name.startsWith(`${t.app}-`),
  );
  if (pods.length === 0) return null;
  return pods.reduce((sum, p) => sum + pick(p), 0);
};

/** Requisições da janela no access log do Traefik. Sem domínio ou sem Loki: null. */
const readRequests = async (
  sources: AlertMetricSources,
  t: AlertTarget,
  windowMinutes: number,
): Promise<RequestEntry[] | null> => {
  if (!t.host) return null;
  const lines = await sources.loki.queryWindow(
    buildTraefikSelector(t.host),
    windowMinutes * 60_000,
  );
  if (!lines) return null;
  return lines
    .map((l) => parseTraefikAccessLog(l.line))
    .filter((e): e is RequestEntry => e !== null);
};

/** CPU em % de um núcleo (100 = 1 vCPU), mesma unidade da tela de métricas. */
const cpu = (sources: AlertMetricSources): AlertMetricStrategy => ({
  measure: async (t, w) =>
    (await sources.prometheus.instant(
      `sum(rate(container_cpu_usage_seconds_total{${podSelector(t)}}[${w}m]))*100`,
    )) ?? sumPodUsage(sources, t, (p) => p.cpuMillicores / 10),
});

/** Memória em MiB (working set, média da janela). */
const memory = (sources: AlertMetricSources): AlertMetricStrategy => ({
  measure: async (t, w) =>
    (await sources.prometheus.instant(
      `sum(avg_over_time(container_memory_working_set_bytes{${podSelector(t)}}[${w}m]))/1024/1024`,
    )) ?? sumPodUsage(sources, t, (p) => p.memoryMib),
});

/** % de respostas 5xx na janela. */
const errorRate5xx = (sources: AlertMetricSources): AlertMetricStrategy => ({
  measure: async (t, w) => {
    const requests = await readRequests(sources, t, w);
    return requests ? computeErrorRate5xx(requests) : null;
  },
});

/** Latência p95 em ms na janela. */
const latencyP95 = (sources: AlertMetricSources): AlertMetricStrategy => ({
  measure: async (t, w) => {
    const requests = await readRequests(sources, t, w);
    return requests
      ? computePercentile(
          requests.map((r) => r.durationMs),
          0.95,
        )
      : null;
  },
});

/** Strategy map por métrica: métrica nova = uma função nova + uma linha aqui. */
export const createAlertMetricStrategies = (
  sources: AlertMetricSources,
): Record<AlertMetric, AlertMetricStrategy> => ({
  CPU: cpu(sources),
  MEMORY: memory(sources),
  ERROR_RATE_5XX: errorRate5xx(sources),
  LATENCY_P95: latencyP95(sources),
});
