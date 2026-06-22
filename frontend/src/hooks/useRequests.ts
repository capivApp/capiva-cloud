import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface RequestEntry {
  time: string;
  method: string;
  host: string;
  path: string;
  status: number;
  durationMs: number;
}

/**
 * Hook da tela Requests: requisições recebidas pelo Traefik (via Loki),
 * filtráveis por host. Atualiza a cada 10s.
 */
export function useRequests(host?: string) {
  const qs = host ? `?host=${encodeURIComponent(host)}` : "";
  const query = useQuery({
    queryKey: ["requests", host ?? "all"],
    queryFn: () => api.get<RequestEntry[]>(`/platform/requests${qs}`),
    refetchInterval: 10_000,
  });

  return {
    requests: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}
