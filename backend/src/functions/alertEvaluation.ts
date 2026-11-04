import { alertEventFor } from "@functions/stateTransition";
import type { AlertEvent, AlertOperator, AlertState } from "@interface/alerts";

export interface EvaluableRule {
  operator: AlertOperator;
  threshold: number;
  state: AlertState;
}

export interface AlertEvaluation {
  state: AlertState;
  event: AlertEvent | null;
  value: number | null;
}

/** Comparador por operador da regra (strategy map). */
const COMPARATORS: Record<AlertOperator, (value: number, threshold: number) => boolean> = {
  GT: (value, threshold) => value > threshold,
  LT: (value, threshold) => value < threshold,
};

/** `null` quando a fonte não devolveu dado: sem veredito, não é "dentro do limite". */
export const isRuleBreached = (
  rule: Pick<EvaluableRule, "operator" | "threshold">,
  value: number | null,
): boolean | null => {
  if (value === null) return null;
  return COMPARATORS[rule.operator](value, rule.threshold);
};

const STATE_BY_BREACH: Record<string, AlertState> = { true: "FIRING", false: "OK" };

/**
 * Próximo estado da regra e o evento da transição. Sem dado o estado atual é
 * mantido: uma fonte fora do ar não pode "resolver" um alerta disparado nem
 * disparar um que estava OK.
 */
export const evaluateAlertRule = (rule: EvaluableRule, value: number | null): AlertEvaluation => {
  const breached = isRuleBreached(rule, value);
  const state = breached === null ? rule.state : STATE_BY_BREACH[String(breached)];
  return { state, event: alertEventFor(rule.state, state), value };
};
