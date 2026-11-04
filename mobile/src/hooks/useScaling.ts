import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useEventSource } from "@/hooks/useEventSource";
import type { ScalingPolicy, ScalingStatus, SetScalingInput } from "@/lib/scaling";

/**
 * Escala de uma aplicação: estado vivo pelo SSE de scaling (nunca polling),
 * escala manual de réplicas e edição do mínimo/máximo do HPA.
 */
export function useScaling(applicationId: string | null) {
  const queryClient = useQueryClient();
  const status = useEventSource<ScalingStatus>(
    applicationId ? `/streams/applications/${applicationId}/scaling` : null,
    "scaling",
  );

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["application", applicationId] });

  const scaleMut = useMutation({
    mutationKey: ["application", applicationId, "scale"],
    mutationFn: (replicas: number) =>
      api.post<{ replicas: number; autoscalerActive: boolean }>(
        `/applications/${applicationId}/scaling/replicas`,
        { replicas },
      ),
    onSuccess: invalidate,
  });

  const policyMut = useMutation({
    mutationKey: ["application", applicationId, "scaling-policy"],
    mutationFn: (input: SetScalingInput) =>
      api.put<ScalingPolicy>(`/applications/${applicationId}/scaling`, input),
    onSuccess: invalidate,
  });

  return {
    status,
    isLoading: status === null,
    scale: scaleMut.mutateAsync,
    isScaling: scaleMut.isPending,
    setPolicy: policyMut.mutateAsync,
    isSavingPolicy: policyMut.isPending,
  };
}
