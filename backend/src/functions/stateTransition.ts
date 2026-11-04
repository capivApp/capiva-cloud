import {
  ALERT_EVENTS,
  UPTIME_EVENTS,
  type AlertEvent,
  type AlertState,
  type UptimeEvent,
} from "@interface/alerts";

/**
 * Transição de um estado booleano. Uptime e alertas notificam só quando o
 * estado MUDA: sem isso, uma aplicação fora do ar mandaria uma mensagem por
 * amostra (uma por minuto) até alguém desligar o canal.
 */
export type Transition = "rising" | "falling";

const TRANSITIONS: Record<string, Transition> = {
  "false:true": "rising",
  "true:false": "falling",
};

export const detectTransition = (previous: boolean, current: boolean): Transition | null =>
  TRANSITIONS[`${previous}:${current}`] ?? null;

/** Estado "no ar": cair dispara downtime, voltar dispara recovery. */
const UPTIME_EVENT_BY_TRANSITION: Record<Transition, UptimeEvent> = {
  falling: UPTIME_EVENTS.DOWNTIME,
  rising: UPTIME_EVENTS.RECOVERY,
};

/**
 * Evento de uptime entre a amostra anterior e a atual. Sem histórico, a
 * verificação parte de "no ar": a primeira falha já avisa, o primeiro sucesso não.
 */
export const uptimeEventFor = (
  previousOk: boolean | undefined,
  currentOk: boolean,
): UptimeEvent | null => {
  const transition = detectTransition(previousOk ?? true, currentOk);
  return transition ? UPTIME_EVENT_BY_TRANSITION[transition] : null;
};

/** Estado "disparado": entrar dispara triggered, sair dispara resolved. */
const ALERT_EVENT_BY_TRANSITION: Record<Transition, AlertEvent> = {
  rising: ALERT_EVENTS.TRIGGERED,
  falling: ALERT_EVENTS.RESOLVED,
};

export const alertEventFor = (previous: AlertState, current: AlertState): AlertEvent | null => {
  const transition = detectTransition(previous === "FIRING", current === "FIRING");
  return transition ? ALERT_EVENT_BY_TRANSITION[transition] : null;
};
