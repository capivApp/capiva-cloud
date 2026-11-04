import { textOf } from "@functions/textOf";

/**
 * O Argo Rollouts aborta o rollout quando a análise do canary/blue-green falha e
 * devolve o tráfego para a versão estável: é o rollback automático. O sinal fica
 * no `status` do recurso (`abort: true` ou fase Degraded com RolloutAborted).
 */
export const isRolloutAborted = (status: Record<string, unknown> | undefined): boolean => {
  if (!status) return false;
  if (status.abort === true) return true;
  return status.phase === "Degraded" && textOf(status.message).includes("RolloutAborted");
};
