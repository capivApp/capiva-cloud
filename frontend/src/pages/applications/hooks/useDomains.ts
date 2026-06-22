import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface Domain {
  id: string;
  applicationId: string;
  host: string;
  tlsMode: "lets_encrypt" | "uploaded" | "none";
  tlsCertificateId: string | null;
  tlsStatus: string;
  createdAt: string;
}

export interface AddDomainInput {
  host: string;
  tlsMode: "lets_encrypt" | "uploaded" | "none";
  tlsCertificateId?: string;
}

/** Hook de domínios customizados de uma aplicação: listar, adicionar, remover. */
export function useDomains(applicationId: string) {
  const queryClient = useQueryClient();
  const key = ["applications", applicationId, "domains"];

  const list = useQuery({
    queryKey: key,
    queryFn: () => api.get<Domain[]>(`/applications/${applicationId}/domains`),
    enabled: Boolean(applicationId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: key });

  const addMut = useMutation({
    mutationFn: (input: AddDomainInput) => api.post<Domain>(`/applications/${applicationId}/domains`, input),
    onSuccess: invalidate,
  });
  const removeMut = useMutation({
    mutationFn: (domainId: string) => api.del(`/applications/${applicationId}/domains/${domainId}`),
    onSuccess: invalidate,
  });

  return {
    domains: list.data ?? [],
    isLoading: list.isLoading,
    add: addMut.mutateAsync,
    isAdding: addMut.isPending,
    remove: removeMut.mutateAsync,
  };
}
