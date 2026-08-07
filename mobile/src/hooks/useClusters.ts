import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/useAuthStore";

export interface Cluster {
  id: string;
  name: string;
  region: string | null;
  status: string;
}

export interface ClusterNode {
  id: string;
  role: "CONTROL_PLANE" | "WORKER";
  host: string;
  internalIp: string | null;
  status: string;
}

export function useClusters() {
  const organizationId = useAuthStore((s) => s.organizationId);
  const list = useQuery({
    queryKey: ["clusters", organizationId],
    queryFn: () => api.get<Cluster[]>("/clusters"),
    enabled: Boolean(organizationId),
  });

  return {
    clusters: list.data ?? [],
    isLoading: list.isLoading,
    refetch: list.refetch,
  };
}

/** Nós registrados do cluster (com id — alvo do terminal SSH). */
export function useClusterNodes(clusterId: string | null) {
  const list = useQuery({
    queryKey: ["cluster-nodes", clusterId],
    queryFn: () => api.get<ClusterNode[]>(`/clusters/${clusterId}/nodes`),
    enabled: Boolean(clusterId),
  });

  return {
    nodes: list.data ?? [],
    isLoading: list.isLoading,
    refetch: list.refetch,
  };
}
