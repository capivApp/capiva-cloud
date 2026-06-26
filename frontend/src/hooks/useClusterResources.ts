import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface PodPort {
  name?: string;
  containerPort: number;
  protocol: string;
}

export type PodCategory = "database" | "platform" | "system" | "app";

export interface ClusterPod {
  name: string;
  namespace: string;
  node: string;
  phase: string;
  ready: boolean;
  restarts: number;
  podIP: string | null;
  ports: PodPort[];
  category: PodCategory;
}

export interface ClusterPodsView {
  clusterId: string;
  clusterName: string;
  total: number;
  pods: ClusterPod[];
}

export interface DatabaseInstance {
  pod: string;
  node: string;
  phase: string;
  ready: boolean;
  role: string;
  ports: PodPort[];
}

export interface DatabaseView {
  name: string;
  namespace: string;
  engine: string;
  instances: DatabaseInstance[];
}

export interface ClusterDatabasesView {
  clusterId: string;
  clusterName: string;
  databases: DatabaseView[];
}

/**
 * Recursos cluster-wide: todos os pods (nó/fase/portas) e os bancos (agrupados
 * por instância com papel/nó). Atualiza sozinho para refletir failover ao vivo.
 */
export function useClusterResources(clusterId: string | null) {
  const pods = useQuery({
    queryKey: ["cluster-pods", clusterId],
    queryFn: () => api.get<ClusterPodsView>(`/platform/cluster-pods?clusterId=${clusterId}`),
    enabled: Boolean(clusterId),
    refetchInterval: 5_000,
  });
  const databases = useQuery({
    queryKey: ["cluster-databases", clusterId],
    queryFn: () => api.get<ClusterDatabasesView>(`/platform/cluster-databases?clusterId=${clusterId}`),
    enabled: Boolean(clusterId),
    refetchInterval: 5_000,
  });

  return {
    pods: pods.data,
    databases: databases.data,
    isLoading: pods.isLoading || databases.isLoading,
    error: (pods.error ?? databases.error) as Error | null,
  };
}
