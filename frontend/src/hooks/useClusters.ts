import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/useAuthStore";

export interface Cluster {
  id: string;
  name: string;
  region: string | null;
  status: string;
}

export function useClusters() {
  const organizationId = useAuthStore((s) => s.organizationId);

  const list = useQuery({
    queryKey: ["clusters", organizationId],
    queryFn: () => api.get<Cluster[]>("/clusters"),
    enabled: Boolean(organizationId),
  });

  const createMut = useMutation({
    mutationKey: ["clusters", "create"],
    mutationFn: (input: { name: string; region?: string; apiUrl: string; token: string; caCert?: string }) =>
      api.post<Cluster>("/clusters", input),
  });

  const updateMut = useMutation({
    mutationKey: ["clusters", "update"],
    mutationFn: ({ id, patch }: { id: string; patch: { name?: string; region?: string; apiUrl?: string; token?: string; caCert?: string } }) =>
      api.patch(`/clusters/${id}`, patch),
  });
  const removeMut = useMutation({ mutationKey: ["clusters", "remove"], mutationFn: (id: string) => api.del(`/clusters/${id}`) });

  return {
    clusters: list.data ?? [],
    isLoading: list.isLoading,
    refetch: list.refetch,
    create: createMut.mutateAsync,
    isCreating: createMut.isPending,
    update: updateMut.mutateAsync,
    remove: removeMut.mutateAsync,
  };
}
