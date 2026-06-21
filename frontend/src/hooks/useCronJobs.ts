import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface CronJob {
  id: string;
  name: string;
  schedule: string;
  source: string;
  observedStatus: string;
  sourceConfig?: { image?: string; env?: { key: string; value: string }[] };
}

export function useCronJobs(projectId?: string | null) {
  const list = useQuery({
    queryKey: ["cron-jobs", projectId],
    queryFn: () => api.get<CronJob[]>(`/cron-jobs?projectId=${projectId}`),
    enabled: Boolean(projectId),
  });
  const createMut = useMutation({
    mutationKey: ["cron-jobs", "create"],
    mutationFn: (dto: { projectId: string; environmentId: string; name: string; schedule: string; source: string; sourceConfig?: Record<string, unknown> }) =>
      api.post<CronJob>("/cron-jobs", dto),
  });
  const updateMut = useMutation({
    mutationKey: ["cron-jobs", "update"],
    mutationFn: ({ id, patch }: { id: string; patch: { environmentId: string; schedule?: string; image?: string; env?: { key: string; value: string }[] } }) =>
      api.patch(`/cron-jobs/${id}`, patch),
  });
  return { cronJobs: list.data ?? [], isLoading: list.isLoading, refetch: list.refetch, create: createMut.mutateAsync, isCreating: createMut.isPending, update: updateMut.mutateAsync };
}
