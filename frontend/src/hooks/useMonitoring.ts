import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface PodMetric {
  name: string;
  namespace: string;
  node: string;
  cpuMillicores: number;
  memoryMib: number;
}

export interface NodeMetric {
  name: string;
  role: "control-plane" | "worker";
  ready: boolean;
  cpuCapacityM: number;
  cpuUsedM: number;
  memCapacityMib: number;
  memUsedMib: number;
  pods: PodMetric[];
}

export interface ClusterMonitoring {
  clusterId: string;
  clusterName: string;
  nodes: NodeMetric[];
  totals: {
    cpuUsedM: number;
    cpuCapacityM: number;
    memUsedMib: number;
    memCapacityMib: number;
    pods: number;
    diskUsedPct: number | null;
    netRxBps: number | null;
    netTxBps: number | null;
  };
}

/**
 * Hook de Monitoring de um cluster (nós + pods via metrics-server).
 * `refetchInterval` mantém os números atualizados sem polling manual na página.
 */
export function useMonitoring(clusterId: string | null) {
  const query = useQuery({
    queryKey: ["monitoring", clusterId],
    queryFn: () => api.get<ClusterMonitoring>(`/platform/monitoring?clusterId=${clusterId}`),
    enabled: Boolean(clusterId),
    refetchInterval: 10_000,
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}
