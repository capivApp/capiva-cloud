/**
 * Avaliação de regra de alerta por métrica: comparação com o limite, estado
 * seguinte e evento de transição. Funções puras, sem fonte de métrica.
 */
import { describe, expect, it } from "bun:test";
import { evaluateAlertRule, isRuleBreached } from "@functions/alertEvaluation";

const rule = (over: Partial<Parameters<typeof evaluateAlertRule>[0]> = {}) => ({
  operator: "GT" as const,
  threshold: 80,
  state: "OK" as const,
  ...over,
});

describe("isRuleBreached", () => {
  it("GT viola quando o valor passa do limite", () => {
    expect(isRuleBreached(rule(), 81)).toBe(true);
    expect(isRuleBreached(rule(), 80)).toBe(false);
    expect(isRuleBreached(rule(), 10)).toBe(false);
  });

  it("LT viola quando o valor fica abaixo do limite", () => {
    expect(isRuleBreached(rule({ operator: "LT", threshold: 1 }), 0.5)).toBe(true);
    expect(isRuleBreached(rule({ operator: "LT", threshold: 1 }), 1)).toBe(false);
  });

  it("sem dado não há veredito", () => {
    expect(isRuleBreached(rule(), null)).toBeNull();
  });
});

describe("evaluateAlertRule", () => {
  it("OK que passa do limite vira FIRING e dispara alert.triggered", () => {
    expect(evaluateAlertRule(rule(), 95)).toEqual({
      state: "FIRING",
      event: "alert.triggered",
      value: 95,
    });
  });

  it("FIRING que continua acima do limite não dispara de novo", () => {
    expect(evaluateAlertRule(rule({ state: "FIRING" }), 99)).toEqual({
      state: "FIRING",
      event: null,
      value: 99,
    });
  });

  it("FIRING que volta para dentro do limite vira OK e dispara alert.resolved", () => {
    expect(evaluateAlertRule(rule({ state: "FIRING" }), 40)).toEqual({
      state: "OK",
      event: "alert.resolved",
      value: 40,
    });
  });

  it("OK dentro do limite continua OK em silêncio", () => {
    expect(evaluateAlertRule(rule(), 40)).toEqual({ state: "OK", event: null, value: 40 });
  });

  it("sem dado mantém o estado atual e não dispara", () => {
    expect(evaluateAlertRule(rule({ state: "FIRING" }), null)).toEqual({
      state: "FIRING",
      event: null,
      value: null,
    });
    expect(evaluateAlertRule(rule(), null)).toEqual({ state: "OK", event: null, value: null });
  });
});
