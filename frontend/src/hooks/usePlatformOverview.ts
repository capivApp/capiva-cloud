import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/useAuthStore";

export interface PlatformOverview {
  counts: { projects: number; applications: number; databases: number; workers: number; environments: number };
  health: Record<string, number>;
  cluster: { totalClusters: number; connected: number; totalNodes: number; totalEnvironments: number };
  recentDeploys: { id: string; application: string; version: string; status: string; startedAt: string }[];
  recentAudits: { id: string; event: string; detail: string | null; at: string }[];
}

/** Hook da visão geral da organização (dashboard). */
export function usePlatformOverview() {
  const organizationId = useAuthStore((s) => s.organizationId);
  const query = useQuery({
    queryKey: ["platform-overview", organizationId],
    queryFn: () => api.get<PlatformOverview>("/platform/overview"),
    enabled: Boolean(organizationId),
  });
  return { overview: query.data, isLoading: query.isLoading };
}
