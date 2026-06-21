import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface Worker {
  id: string;
  name: string;
  source: string;
  replicas: number;
  observedStatus: string;
  sourceConfig?: { image?: string; env?: { key: string; value: string }[] };
}

export function useWorkers(projectId?: string | null) {
  const list = useQuery({
    queryKey: ["workers", projectId],
    queryFn: () => api.get<Worker[]>(`/workers?projectId=${projectId}`),
    enabled: Boolean(projectId),
  });
  const createMut = useMutation({
    mutationKey: ["workers", "create"],
    mutationFn: (dto: { projectId: string; environmentId: string; name: string; source: string; sourceConfig?: Record<string, unknown>; replicas?: number }) =>
      api.post<Worker>("/workers", dto),
  });
  const updateMut = useMutation({
    mutationKey: ["workers", "update"],
    mutationFn: ({ id, patch }: { id: string; patch: { environmentId: string; replicas?: number; image?: string; env?: { key: string; value: string }[] } }) =>
      api.patch(`/workers/${id}`, patch),
  });
  return { workers: list.data ?? [], isLoading: list.isLoading, refetch: list.refetch, create: createMut.mutateAsync, isCreating: createMut.isPending, update: updateMut.mutateAsync };
}
