import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ConsumoDeRecursos, LimiteDeQuota } from "@/lib/finops";
import { useAuthStore } from "@/stores/useAuthStore";

export interface QuotaDoAmbiente {
  environmentId: string;
  limite: LimiteDeQuota;
  uso: ConsumoDeRecursos;
  disponivel: LimiteDeQuota;
}

/** Quota do ambiente: limite, uso e disponível, e a gravação dos limites. */
export function useEnvironmentQuota(environmentId: string | null | undefined) {
  const organizationId = useAuthStore((s) => s.organizationId);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["environment-quota", organizationId, environmentId],
    queryFn: () => api.get<QuotaDoAmbiente>(`/environments/${environmentId}/quota`),
    enabled: Boolean(organizationId && environmentId),
  });

  const saveMut = useMutation({
    mutationKey: ["environment-quota", "save"],
    mutationFn: (limite: LimiteDeQuota) => api.put<QuotaDoAmbiente>(`/environments/${environmentId}/quota`, limite),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["environment-quota"] }),
  });

  return {
    quota: query.data,
    data: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
    save: saveMut.mutateAsync,
    isSaving: saveMut.isPending,
  };
}
