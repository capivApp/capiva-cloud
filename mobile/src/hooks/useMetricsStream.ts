import { useEventSource } from "@/hooks/useEventSource";

export interface AppMetrics {
  cpu: number;
  memoryMb: number;
  requestsPerSec: number;
  latencyP95Ms: number;
  errorRate: number;
}

/** Métricas em tempo real via SSE (NUNCA polling). */
export function useMetricsStream(applicationId: string | null) {
  return useEventSource<AppMetrics>(applicationId ? `/streams/applications/${applicationId}/metrics` : null, "metrics");
}
