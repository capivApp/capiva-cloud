/**
 * Vocabulário dos alertas por métrica. Os valores espelham os enums do schema
 * Prisma (`AlertMetric`, `AlertOperator`, `AlertState`) para que as funções
 * puras não dependam do client gerado.
 */
export const ALERT_METRICS = ["CPU", "MEMORY", "ERROR_RATE_5XX", "LATENCY_P95"] as const;
export type AlertMetric = (typeof ALERT_METRICS)[number];

export const ALERT_OPERATORS = ["GT", "LT"] as const;
export type AlertOperator = (typeof ALERT_OPERATORS)[number];

export const ALERT_STATES = ["OK", "FIRING"] as const;
export type AlertState = (typeof ALERT_STATES)[number];

export const ALERT_EVENTS = { TRIGGERED: "alert.triggered", RESOLVED: "alert.resolved" } as const;
export type AlertEvent = (typeof ALERT_EVENTS)[keyof typeof ALERT_EVENTS];

export const UPTIME_EVENTS = { DOWNTIME: "downtime", RECOVERY: "recovery" } as const;
export type UptimeEvent = (typeof UPTIME_EVENTS)[keyof typeof UPTIME_EVENTS];
