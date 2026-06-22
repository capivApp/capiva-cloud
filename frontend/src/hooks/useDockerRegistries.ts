import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/useAuthStore";

export interface DockerRegistry {
  id: string;
  name: string;
  url: string;
  username: string;
  createdAt: string;
}

export interface CreateDockerRegistryInput {
  name: string;
  url: string;
  username: string;
  password: string;
}

/** Hook de Registries Docker privados (org): listar/criar/remover. */
export function useDockerRegistries() {
  const organizationId = useAuthStore((s) => s.organizationId);
  const queryClient = useQueryClient();
  const key = ["docker-registries", organizationId];

  const list = useQuery({
    queryKey: key,
    queryFn: () => api.get<DockerRegistry[]>("/docker-registries"),
    enabled: Boolean(organizationId),
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: key });

  const createMut = useMutation({ mutationFn: (input: CreateDockerRegistryInput) => api.post<DockerRegistry>("/docker-registries", input), onSuccess: invalidate });
  const removeMut = useMutation({ mutationFn: (id: string) => api.del(`/docker-registries/${id}`), onSuccess: invalidate });

  return {
    registries: list.data ?? [],
    isLoading: list.isLoading,
    create: createMut.mutateAsync,
    isCreating: createMut.isPending,
    remove: removeMut.mutateAsync,
  };
}
