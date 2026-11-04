import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useEventSource } from "@/hooks/useEventSource";
import type { DeploymentProgress } from "@/lib/deployments";

/**
 * Andamento de um deploy pelo SSE /streams/deployments/:id. Ao concluir,
 * revalida a aplicação para o histórico e o status saírem do "em andamento".
 * Monte com `key={deploymentId}`: o estado é de um deploy só.
 */
export function useDeploymentProgress(applicationId: string | null, deploymentId: string | null) {
  const queryClient = useQueryClient();
  const progress = useEventSource<DeploymentProgress>(deploymentId ? `/streams/deployments/${deploymentId}` : null, "progress");
  const isDone = Boolean(progress?.done);

  useEffect(() => {
    if (!isDone) return;
    queryClient.invalidateQueries({ queryKey: ["application", applicationId] });
    queryClient.invalidateQueries({ queryKey: ["applications"] });
  }, [isDone, applicationId, queryClient]);

  return { progress, isDone };
}
