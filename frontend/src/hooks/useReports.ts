import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface UptimeCheck {
  id: string;
  applicationId: string;
  url: string;
  intervalSec: number;
  enabled: boolean;
  createdAt: string;
}

export interface UptimeReport {
  checkId: string;
  url: string;
  enabled: boolean;
  samples: number;
  uptimePercent: number;
  downtimeCount: number;
  avgLatencyMs: number;
  lastStatus: "up" | "down" | "unknown";
  lastCheckedAt: string | null;
}

/** Hook de reports/uptime de uma aplicação: checks (CRUD/run) + relatório agregado. */
export function useReports(applicationId: string | null) {
  const queryClient = useQueryClient();
  const enabled = Boolean(applicationId);
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["uptime-checks", applicationId] });
    queryClient.invalidateQueries({ queryKey: ["reports", applicationId] });
  };

  const checks = useQuery({ queryKey: ["uptime-checks", applicationId], queryFn: () => api.get<UptimeCheck[]>(`/applications/${applicationId}/uptime-checks`), enabled });
  const reports = useQuery({ queryKey: ["reports", applicationId], queryFn: () => api.get<UptimeReport[]>(`/applications/${applicationId}/reports`), enabled, refetchInterval: 15_000 });

  const createMut = useMutation({ mutationFn: (input: { url: string; intervalSec?: number }) => api.post<UptimeCheck>(`/applications/${applicationId}/uptime-checks`, input), onSuccess: invalidate });
  const runMut = useMutation({ mutationFn: (checkId: string) => api.post(`/applications/${applicationId}/uptime-checks/${checkId}/run`, {}), onSuccess: invalidate });
  const removeMut = useMutation({ mutationFn: (checkId: string) => api.del(`/applications/${applicationId}/uptime-checks/${checkId}`), onSuccess: invalidate });

  return {
    checks: checks.data ?? [],
    reports: reports.data ?? [],
    isLoading: checks.isLoading,
    create: createMut.mutateAsync,
    isCreating: createMut.isPending,
    run: runMut.mutateAsync,
    remove: removeMut.mutateAsync,
  };
}
