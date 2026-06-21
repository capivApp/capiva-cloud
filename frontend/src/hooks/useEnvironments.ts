import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/useAuthStore";

export interface Environment {
  id: string;
  name: string;
  kind: "DEVELOPMENT" | "STAGING" | "PRODUCTION";
  namespace: string;
  clusterId: string | null;
}

export function useEnvironments() {
  const organizationId = useAuthStore((s) => s.organizationId);

  const list = useQuery({
    queryKey: ["environments", organizationId],
    queryFn: () => api.get<Environment[]>("/environments"),
    enabled: Boolean(organizationId),
  });

  const createMut = useMutation({
    mutationKey: ["environments", "create"],
    mutationFn: (input: { name: string; kind: Environment["kind"]; clusterId?: string }) =>
      api.post<Environment>("/environments", input),
  });
  const updateMut = useMutation({
    mutationKey: ["environments", "update"],
    mutationFn: ({ id, patch }: { id: string; patch: { name?: string; kind?: string; clusterId?: string | null } }) =>
      api.patch(`/environments/${id}`, patch),
  });
  const removeMut = useMutation({ mutationKey: ["environments", "remove"], mutationFn: (id: string) => api.del(`/environments/${id}`) });

  return {
    environments: list.data ?? [],
    isLoading: list.isLoading,
    refetch: list.refetch,
    create: createMut.mutateAsync,
    isCreating: createMut.isPending,
    update: updateMut.mutateAsync,
    remove: removeMut.mutateAsync,
  };
}
