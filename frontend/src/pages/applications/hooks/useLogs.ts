import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { ApiError, api } from "@/lib/api";
import { useEventSource } from "@/hooks/useEventSource";
import {
  buildLogQuery,
  readLogFilters,
  writeLogFilters,
  type LogFilterState,
  type LogLevel,
} from "@/pages/applications/logSearch/logFilters";

export interface LogLine {
  ts: string;
  line: string;
  pod?: string;
  level?: LogLevel;
}

export type LogDownloadFormat = "txt" | "ndjson";

/** Mensagem do erro da API: a do campo (422 do Zod) ou a geral. */
export const messageOfLogError = (error: unknown): string | undefined => {
  if (!error) return undefined;
  const issues = (error instanceof ApiError ? (error.body as { issues?: Array<{ message: string }> })?.issues : undefined) ?? [];
  return issues[0]?.message ?? (error as Error).message;
};

/** Filtros da tela de logs guardados na URL (link compartilhável). */
export function useLogFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = readLogFilters(searchParams);
  const setFilters = (patch: Partial<LogFilterState>) =>
    setSearchParams((current) => writeLogFilters(current, patch), { replace: true });
  return { filters, setFilters };
}

/**
 * Logs de uma aplicação com os filtros da tela. "Ao vivo" usa o SSE (com os filtros
 * de texto/nível/pod); um intervalo usa a busca via React Query.
 */
export function useLogs(applicationId: string, filters: LogFilterState) {
  const isLive = filters.interval === "live";
  const liveQuery = buildLogQuery(filters, "live");
  const searchQuery = buildLogQuery(filters, "search");
  // Pods dependem só do intervalo: filtrar por pod não pode esconder os outros da lista.
  const podsQuery = buildLogQuery({ ...filters, q: "", exclude: "", regex: "", levels: [], pod: "" }, "search");

  const live = useEventSource<LogLine[]>(
    applicationId && isLive ? `/streams/applications/${applicationId}/logs${liveQuery ? `?${liveQuery}` : ""}` : null,
    "logs",
  );

  const search = useQuery({
    queryKey: ["applications", applicationId, "logs", searchQuery],
    queryFn: () => api.get<{ lines: LogLine[] }>(`/applications/${applicationId}/logs?${searchQuery}`),
    enabled: Boolean(applicationId) && !isLive,
    placeholderData: keepPreviousData,
  });

  const pods = useQuery({
    queryKey: ["applications", applicationId, "logs", "pods", podsQuery],
    queryFn: () => api.get<{ pods: string[] }>(`/applications/${applicationId}/logs/pods?${podsQuery}`),
    enabled: Boolean(applicationId),
    staleTime: 60_000,
  });

  const downloadMut = useMutation({
    mutationFn: (format: LogDownloadFormat) =>
      api.download(`/applications/${applicationId}/logs/download?${buildLogQuery(filters, "download")}&format=${format}`, `logs.${format}`),
  });

  return {
    isLive,
    lines: (isLive ? live : search.data?.lines) ?? [],
    isLoading: !isLive && search.isLoading,
    isFetching: !isLive && search.isFetching,
    error: messageOfLogError(search.error),
    refetch: search.refetch,
    pods: pods.data?.pods ?? [],
    download: downloadMut.mutateAsync,
    isDownloading: downloadMut.isPending,
  };
}
