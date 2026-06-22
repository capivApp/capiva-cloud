import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/useAuthStore";

export interface TlsCertificate {
  id: string;
  name: string;
  createdAt: string;
}

export interface CreateTlsCertificateInput {
  name: string;
  cert: string;
  key: string;
}

/**
 * Hook da feature "TLS certificates" (org). Encapsula react-query: listar,
 * cadastrar (cert+key PEM) e remover. O material nunca volta do backend.
 */
export function useTlsCertificates() {
  const organizationId = useAuthStore((s) => s.organizationId);
  const queryClient = useQueryClient();
  const key = ["tls-certificates", organizationId];

  const list = useQuery({
    queryKey: key,
    queryFn: () => api.get<TlsCertificate[]>("/tls-certificates"),
    enabled: Boolean(organizationId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: key });

  const createMut = useMutation({ mutationFn: (input: CreateTlsCertificateInput) => api.post<TlsCertificate>("/tls-certificates", input), onSuccess: invalidate });
  const removeMut = useMutation({ mutationFn: (id: string) => api.del(`/tls-certificates/${id}`), onSuccess: invalidate });

  return {
    certificates: list.data ?? [],
    isLoading: list.isLoading,
    refetch: list.refetch,
    create: createMut.mutateAsync,
    isCreating: createMut.isPending,
    remove: removeMut.mutateAsync,
  };
}
