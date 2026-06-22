import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/useAuthStore";
import type { Role } from "@/hooks/useMembers";

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  role: Role;
  lastUsedAt: string | null;
  createdAt: string;
  /** Presente apenas na resposta de criação (mostrado uma vez). */
  secret?: string;
}

/** Hook de API/CLI keys (org): listar, criar (secret 1x), revogar. */
export function useApiKeys() {
  const organizationId = useAuthStore((s) => s.organizationId);
  const queryClient = useQueryClient();
  const key = ["api-keys", organizationId];

  const list = useQuery({ queryKey: key, queryFn: () => api.get<ApiKey[]>("/api-keys"), enabled: Boolean(organizationId) });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: key });

  const createMut = useMutation({ mutationFn: (input: { name: string; role: Role }) => api.post<ApiKey>("/api-keys", input), onSuccess: invalidate });
  const removeMut = useMutation({ mutationFn: (id: string) => api.del(`/api-keys/${id}`), onSuccess: invalidate });

  return {
    keys: list.data ?? [],
    isLoading: list.isLoading,
    create: createMut.mutateAsync,
    isCreating: createMut.isPending,
    remove: removeMut.mutateAsync,
  };
}
