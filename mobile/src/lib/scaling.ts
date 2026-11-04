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

/** Estado vivo do autoscaling (SSE /streams/applications/:id/scaling). */
export interface ScalingStatus {
  policy: ScalingPolicy | null;
  currentReplicas: number;
  autoscalerActive: boolean;
}

export interface StepperLimites {
  min: number;
  max: number;
}

export type ModoEscala = "manual" | "hpa";

/** Mesmo contrato do `scaleReplicasSchema` do backend (0 a 100). */
export const REPLICAS_MIN = 0;
export const REPLICAS_MAX = 100;
/** O HPA exige ao menos 1 réplica (`setScalingSchema`). */
export const HPA_MIN = 1;

export const clampReplicas = (value: number, limites: StepperLimites): number =>
  Math.min(limites.max, Math.max(limites.min, Math.round(value)));

export const stepReplicas = (value: number, delta: number, limites: StepperLimites): number =>
  clampReplicas(value + delta, limites);

export const buildLimitesManuais = (): StepperLimites => ({ min: REPLICAS_MIN, max: REPLICAS_MAX });

/** O mínimo nunca passa do máximo e o máximo nunca fica abaixo do mínimo. */
export const buildLimitesHpa = (
  minReplicas: number,
  maxReplicas: number,
): { minimo: StepperLimites; maximo: StepperLimites } => ({
  minimo: { min: HPA_MIN, max: maxReplicas },
  maximo: { min: minReplicas, max: REPLICAS_MAX },
});

/** O PUT da política exige métrica e alvo: preserva os da política atual. */
export const buildScalingPayload = (policy: ScalingPolicy, minReplicas: number, maxReplicas: number): SetScalingInput => ({
  minReplicas,
  maxReplicas,
  metric: policy.metric,
  target: policy.target,
});

/** Com política de autoscaling a escala é pelo HPA (mínimo e máximo); sem ela, réplicas fixas. */
export const resolveModoEscala = (status: ScalingStatus | null | undefined): ModoEscala => (status?.policy ? "hpa" : "manual");
