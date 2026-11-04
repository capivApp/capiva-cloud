/// <reference types="bun" />
/**
 * Limites do stepper de réplicas (manual e HPA) e payload da política.
 * Funções puras, sem rede.
 */
import { describe, expect, test } from "bun:test";
import {
  REPLICAS_MAX,
  REPLICAS_MIN,
  buildLimitesHpa,
  buildLimitesManuais,
  buildScalingPayload,
  clampReplicas,
  resolveModoEscala,
  stepReplicas,
} from "@/lib/scaling";

const policy = { id: "p1", applicationId: "a1", minReplicas: 2, maxReplicas: 6, metric: "CPU" as const, target: 70 };

describe("limites manuais", () => {
  test("vão de 0 a 100 (mesmo contrato do backend)", () => {
    expect(REPLICAS_MIN).toBe(0);
    expect(REPLICAS_MAX).toBe(100);
    expect(buildLimitesManuais()).toEqual({ min: 0, max: 100 });
  });
});

describe("clampReplicas / stepReplicas", () => {
  const limites = { min: 1, max: 5 };

  test("mantém o valor dentro dos limites", () => {
    expect(clampReplicas(3, limites)).toBe(3);
    expect(clampReplicas(-2, limites)).toBe(1);
    expect(clampReplicas(9, limites)).toBe(5);
  });

  test("arredonda valores fracionados", () => {
    expect(clampReplicas(2.6, limites)).toBe(3);
  });

  test("incrementa e decrementa sem sair dos limites", () => {
    expect(stepReplicas(3, 1, limites)).toBe(4);
    expect(stepReplicas(5, 1, limites)).toBe(5);
    expect(stepReplicas(1, -1, limites)).toBe(1);
  });
});

describe("buildLimitesHpa", () => {
  test("mínimo vai de 1 até o máximo atual; máximo vai do mínimo atual até 100", () => {
    expect(buildLimitesHpa(2, 6)).toEqual({ minimo: { min: 1, max: 6 }, maximo: { min: 2, max: 100 } });
  });
});

describe("buildScalingPayload", () => {
  test("preserva métrica e alvo da política e troca só mínimo e máximo", () => {
    expect(buildScalingPayload(policy, 3, 8)).toEqual({ minReplicas: 3, maxReplicas: 8, metric: "CPU", target: 70 });
  });
});

describe("resolveModoEscala", () => {
  test("com política de autoscaling edita mínimo e máximo", () => {
    expect(resolveModoEscala({ policy, currentReplicas: 2, autoscalerActive: true })).toBe("hpa");
  });

  test("sem política escala réplicas fixas", () => {
    expect(resolveModoEscala({ policy: null, currentReplicas: 1, autoscalerActive: false })).toBe("manual");
    expect(resolveModoEscala(null)).toBe("manual");
  });
});
