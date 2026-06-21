import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Application } from "@/pages/applications/hooks/useApplications";

export interface Deployment {
  id: string;
  version: string;
  status: string;
  progress: number;
  podCount: number;
  startedAt: string;
  finishedAt: string | null;
}

/**
 * Hook de detalhe de uma aplicação. Encapsula react-query e reexpõe dados +
 * ações. SEM polling: métricas vêm por SSE (useMetricsStream) e os deploys são
 * re-buscados quando o stream SSE de progresso sinaliza conclusão.
 */
export function useApplication(id: string) {
  const app = useQuery({
    queryKey: ["application", id],
    queryFn: () => api.get<Application>(`/applications/${id}`),
    enabled: Boolean(id),
  });

  const deployments = useQuery({
    queryKey: ["deployments", id],
    queryFn: () => api.get<Deployment[]>(`/applications/${id}/deployments`),
    enabled: Boolean(id),
  });

  const deployMut = useMutation({ mutationKey: ["application", "deploy", id], mutationFn: () => api.post<Deployment>(`/applications/${id}/deploy`, {}) });
  const rollbackMut = useMutation({ mutationKey: ["application", "rollback", id], mutationFn: (deploymentId: string) => api.post(`/applications/${id}/rollback`, { deploymentId }) });
  const strategyMut = useMutation({
    mutationKey: ["application", "strategy", id],
    mutationFn: (input: { strategy: string; config: Record<string, unknown> }) => api.patch(`/applications/${id}/strategy`, input),
  });

  return {
    app: app.data,
    deployments: deployments.data ?? [],
    refetchDeployments: deployments.refetch,
    deploy: deployMut.mutateAsync,
    isDeploying: deployMut.isPending,
    rollback: rollbackMut.mutateAsync,
    updateStrategy: strategyMut.mutateAsync,
    latestDeploymentId: deployments.data?.[0]?.id ?? null,
  };
}
