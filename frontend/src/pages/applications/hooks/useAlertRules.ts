import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export const ALERT_METRICS = ["CPU", "MEMORY", "ERROR_RATE_5XX", "LATENCY_P95"] as const;
export type AlertMetric = (typeof ALERT_METRICS)[number];

export const ALERT_OPERATORS = ["GT", "LT"] as const;
export type AlertOperator = (typeof ALERT_OPERATORS)[number];

export interface AlertRule {
  id: string;
  applicationId: string;
  metric: AlertMetric;
  operator: AlertOperator;
  threshold: number;
  windowMinutes: number;
  enabled: boolean;
  state: "OK" | "FIRING";
  lastValue: number | null;
  lastEvaluatedAt: string | null;
  lastTransitionAt: string | null;
  createdAt: string;
}

export interface AlertRuleInput {
  metric: AlertMetric;
  operator: AlertOperator;
  threshold: number;
  windowMinutes: number;
  enabled?: boolean;
}

/** Hook das regras de alerta por métrica de uma aplicação: listar, criar, alterar, remover. */
export function useAlertRules(applicationId: string) {
  const queryClient = useQueryClient();
  const key = ["applications", applicationId, "alert-rules"];
  const url = `/applications/${applicationId}/alert-rules`;

  // O estado (OK/FIRING) muda pelo scheduler: revalida a cada minuto.
  const list = useQuery({
    queryKey: key,
    queryFn: () => api.get<AlertRule[]>(url),
    enabled: Boolean(applicationId),
    refetchInterval: 60_000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: key });

  const createMut = useMutation({
    mutationFn: (input: AlertRuleInput) => api.post<AlertRule>(url, input),
    onSuccess: invalidate,
  });
  const updateMut = useMutation({
    mutationFn: ({ id, ...input }: Partial<AlertRuleInput> & { id: string }) =>
      api.patch<AlertRule>(`${url}/${id}`, input),
    onSuccess: invalidate,
  });
  const removeMut = useMutation({
    mutationFn: (id: string) => api.del(`${url}/${id}`),
    onSuccess: invalidate,
  });

  return {
    rules: list.data ?? [],
    isLoading: list.isLoading,
    isFetching: list.isFetching,
    error: list.error,
    refetch: list.refetch,
    create: createMut.mutateAsync,
    isCreating: createMut.isPending,
    update: updateMut.mutateAsync,
    remove: removeMut.mutateAsync,
  };
}
