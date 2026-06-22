import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { VolumeSpec } from "@/pages/applications/hooks/useApplications";

export interface Volume extends VolumeSpec {
  id: string;
  applicationId: string;
  createdAt: string;
}

/**
 * Hook da feature "volumes" de uma aplicação. Encapsula react-query
 * (listar/criar/remover) e invalida a lista após mutações.
 */
export function useVolumes(applicationId: string) {
  const queryClient = useQueryClient();
  const key = ["applications", applicationId, "volumes"];

  const list = useQuery({
    queryKey: key,
    queryFn: () => api.get<Volume[]>(`/applications/${applicationId}/volumes`),
    enabled: Boolean(applicationId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: key });

  const createMut = useMutation({
    mutationFn: (dto: VolumeSpec) => api.post<Volume>(`/applications/${applicationId}/volumes`, dto),
    onSuccess: invalidate,
  });
  const removeMut = useMutation({
    mutationFn: (volumeId: string) => api.del(`/applications/${applicationId}/volumes/${volumeId}`),
    onSuccess: invalidate,
  });

  return {
    volumes: list.data ?? [],
    isLoading: list.isLoading,
    error: list.error as Error | null,
    refetch: list.refetch,
    create: createMut.mutateAsync,
    isCreating: createMut.isPending,
    remove: removeMut.mutateAsync,
    isRemoving: removeMut.isPending,
  };
}
