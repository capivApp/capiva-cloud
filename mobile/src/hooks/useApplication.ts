import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Application } from "@/hooks/useApplications";

export interface Deployment {
  id: string;
  version: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
}

/** Detalhe + ciclo de vida de uma aplicação (deploy/stop/start/restart/rollback). */
export function useApplication(id: string | null) {
  const queryClient = useQueryClient();

  const detail = useQuery({
    queryKey: ["application", id],
    queryFn: () => api.get<Application>(`/applications/${id}`),
    enabled: Boolean(id),
    refetchInterval: 10_000,
  });

  const deployments = useQuery({
    queryKey: ["application", id, "deployments"],
    queryFn: () => api.get<Deployment[]>(`/applications/${id}/deployments`),
    enabled: Boolean(id),
    refetchInterval: 10_000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["application", id] });
    queryClient.invalidateQueries({ queryKey: ["applications"] });
  };

  const lifecycle = (path: string) => ({
    mutationKey: ["application", id, path],
    mutationFn: () => api.post(`/applications/${id}/${path}`, {}),
    onSuccess: invalidate,
  });

  const deployMut = useMutation(lifecycle("deploy"));
  const stopMut = useMutation(lifecycle("stop"));
  const startMut = useMutation(lifecycle("start"));
  const restartMut = useMutation(lifecycle("restart"));
  const rollbackMut = useMutation(lifecycle("rollback"));

  return {
    app: detail.data,
    isLoading: detail.isLoading,
    refetch: detail.refetch,
    deployments: deployments.data ?? [],
    deploy: deployMut.mutateAsync,
    isDeploying: deployMut.isPending,
    stop: stopMut.mutateAsync,
    isStopping: stopMut.isPending,
    start: startMut.mutateAsync,
    isStarting: startMut.isPending,
    restart: restartMut.mutateAsync,
    isRestarting: restartMut.isPending,
    rollback: rollbackMut.mutateAsync,
    isRollingBack: rollbackMut.isPending,
  };
}
