import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface Application {
  id: string;
  name: string;
  source: string;
  profile: string;
  rolloutStrategy: string;
  observedStatus: string;
  desiredStatus: string;
  port: number | null;
  sourceConfig: Record<string, unknown>;
  tags?: string[] | null;
  createdAt: string;
}

export interface VolumeSpec {
  name: string;
  mountPath: string;
  sizeGi: number;
  accessMode: "RWO" | "RWX";
}

export interface CreateApplicationDTO {
  projectId: string;
  environmentId: string;
  name: string;
  source: string;
  gitConnectionId?: string;
  sourceConfig?: Record<string, unknown>;
  profile?: string;
  rolloutStrategy?: string;
  port?: number;
  env?: { key: string; value: string }[];
  buildArgs?: { key: string; value: string }[];
  tags?: string[];
  volumes?: VolumeSpec[];
}

/**
 * Hook da feature "applications". Encapsula react-query e reexpõe data/funções.
 * Inclui ciclo de vida (deploy/stop/start/restart/remove).
 */
export function useApplications(projectId?: string | null) {
  const list = useQuery({
    queryKey: ["applications", projectId],
    queryFn: () => api.get<Application[]>(`/applications?projectId=${projectId}`),
    enabled: Boolean(projectId),
  });

  const createMut = useMutation({ mutationKey: ["applications", "create"], mutationFn: (dto: CreateApplicationDTO) => api.post<Application>("/applications", dto) });
  const deployMut = useMutation({ mutationKey: ["applications", "deploy"], mutationFn: (id: string) => api.post(`/applications/${id}/deploy`, {}) });
  const stopMut = useMutation({ mutationKey: ["applications", "stop"], mutationFn: (id: string) => api.post(`/applications/${id}/stop`, {}) });
  const startMut = useMutation({ mutationKey: ["applications", "start"], mutationFn: (id: string) => api.post(`/applications/${id}/start`, {}) });
  const restartMut = useMutation({ mutationKey: ["applications", "restart"], mutationFn: (id: string) => api.post(`/applications/${id}/restart`, {}) });
  const removeMut = useMutation({ mutationKey: ["applications", "remove"], mutationFn: (id: string) => api.del(`/applications/${id}`) });
  const tagsMut = useMutation({ mutationKey: ["applications", "tags"], mutationFn: ({ id, tags }: { id: string; tags: string[] }) => api.patch(`/applications/${id}/tags`, { tags }) });

  return {
    applications: list.data ?? [],
    isLoading: list.isLoading,
    error: list.error as Error | null,
    refetch: list.refetch,
    create: createMut.mutateAsync,
    isCreating: createMut.isPending,
    deploy: deployMut.mutateAsync,
    isDeploying: deployMut.isPending,
    stop: stopMut.mutateAsync,
    start: startMut.mutateAsync,
    restart: restartMut.mutateAsync,
    remove: removeMut.mutateAsync,
    updateTags: tagsMut.mutateAsync,
  };
}
