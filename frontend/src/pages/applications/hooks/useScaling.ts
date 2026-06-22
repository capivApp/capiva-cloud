import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type ScalingMetric = "CPU" | "MEMORY" | "REQUESTS";

export interface ScalingPolicy {
  id: string;
  applicationId: string;
  minReplicas: number;
  maxReplicas: number;
  metric: ScalingMetric;
  target: number;
}

export interface SetScalingInput {
  minReplicas: number;
  maxReplicas: number;
  metric: ScalingMetric;
  target: number;
}

/** Estado vivo do autoscaling (vindo do SSE /streams/applications/:id/scaling). */
export interface ScalingStatus {
  policy: ScalingPolicy | null;
  hpa: {
    exists: boolean;
    currentReplicas?: number;
    desiredReplicas?: number;
    minReplicas?: number;
    maxReplicas?: number;
    lastScaleTime?: string;
    metric?: string;
    currentMetricValue?: string;
    targetMetricValue?: string;
    conditions?: { type: string; status: string; reason?: string; message?: string }[];
  };
  currentReplicas: number;
  autoscalerActive: boolean;
}

/** Hook de autoscaling de uma app: política (get/set/disable) e escala manual. */
export function useScaling(applicationId: string) {
  const queryClient = useQueryClient();
  const key = ["applications", applicationId, "scaling"];

  const policy = useQuery({
    queryKey: key,
    queryFn: () => api.get<ScalingPolicy | null>(`/applications/${applicationId}/scaling`),
    enabled: Boolean(applicationId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: key });

  const setMut = useMutation({
    mutationFn: (input: SetScalingInput) => api.put<ScalingPolicy>(`/applications/${applicationId}/scaling`, input),
    onSuccess: invalidate,
  });
  const disableMut = useMutation({
    mutationFn: () => api.del(`/applications/${applicationId}/scaling`),
    onSuccess: invalidate,
  });
  const scaleMut = useMutation({
    mutationFn: (replicas: number) => api.post<{ replicas: number; autoscalerActive: boolean }>(`/applications/${applicationId}/scaling/replicas`, { replicas }),
  });

  return {
    policy: policy.data ?? null,
    isLoading: policy.isLoading,
    setPolicy: setMut.mutateAsync,
    isSaving: setMut.isPending,
    disable: disableMut.mutateAsync,
    scale: scaleMut.mutateAsync,
    isScaling: scaleMut.isPending,
  };
}
