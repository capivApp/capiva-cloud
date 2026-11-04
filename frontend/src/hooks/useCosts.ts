import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { FaixaDeCusto } from "@/lib/finops";
import { useAuthStore } from "@/stores/useAuthStore";

export interface ItemDeCusto {
  id: string;
  name: string;
  projectId: string;
  environmentId: string;
  custo: FaixaDeCusto;
}

export interface GrupoDeCusto {
  id: string;
  name: string;
  custo: FaixaDeCusto;
}

export interface RelatorioDeCusto {
  currency: string;
  precos: { currency: string; vcpuHour: number; ramGbHour: number; diskGbMonth: number };
  total: FaixaDeCusto;
  aplicacoes: ItemDeCusto[];
  bancos: ItemDeCusto[];
  projetos: GrupoDeCusto[];
  ambientes: GrupoDeCusto[];
}

/** Custo mensal estimado da organização (`GET /costs`). */
export function useCosts() {
  const organizationId = useAuthStore((s) => s.organizationId);
  const query = useQuery({
    queryKey: ["costs", organizationId],
    queryFn: () => api.get<RelatorioDeCusto>("/costs"),
    enabled: Boolean(organizationId),
  });
  return {
    relatorio: query.data,
    data: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  };
}

/** Estimativa do wizard: custo mensal do perfil escolhido. */
export function useCustoEstimadoDoPerfil(profile: string) {
  const organizationId = useAuthStore((s) => s.organizationId);
  const query = useQuery({
    queryKey: ["costs", "estimate", organizationId, profile],
    queryFn: () =>
      api.get<{ currency: string; custo: FaixaDeCusto }>(
        `/costs/estimate/application?profile=${encodeURIComponent(profile)}`,
      ),
    enabled: Boolean(organizationId && profile),
  });
  return {
    estimativa: query.data,
    data: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  };
}
