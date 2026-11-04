import type { NotificationMessage } from "@infra/notifications/adapters";
import type { AlertEvent, AlertMetric, AlertOperator, UptimeEvent } from "@interface/alerts";

/** Nome e unidade de cada métrica, como aparecem para o usuário. */
export const ALERT_METRIC_LABELS: Record<AlertMetric, { label: string; unit: string }> = {
  CPU: { label: "CPU", unit: "%" },
  MEMORY: { label: "Memória", unit: " MiB" },
  ERROR_RATE_5XX: { label: "Taxa de 5xx", unit: "%" },
  LATENCY_P95: { label: "Latência p95", unit: " ms" },
};

const OPERATOR_LABELS: Record<AlertOperator, string> = { GT: "acima de", LT: "abaixo de" };

export interface AlertMessageInput {
  app: string;
  rule: { metric: AlertMetric; operator: AlertOperator; threshold: number; windowMinutes: number };
  value: number;
}

const formatValue = (value: number, unit: string): string =>
  `${Math.round(value * 10) / 10}${unit}`;

const ALERT_MESSAGES: Record<
  AlertEvent,
  (input: AlertMessageInput) => Omit<NotificationMessage, "event">
> = {
  "alert.triggered": ({ app, rule, value }) => {
    const { label, unit } = ALERT_METRIC_LABELS[rule.metric];
    return {
      title: `Alerta: ${label} de ${app}`,
      body: `${label} em ${formatValue(value, unit)}, ${OPERATOR_LABELS[rule.operator]} ${formatValue(rule.threshold, unit)} nos últimos ${rule.windowMinutes} min.`,
    };
  },
  "alert.resolved": ({ app, rule, value }) => {
    const { label, unit } = ALERT_METRIC_LABELS[rule.metric];
    return {
      title: `Alerta resolvido: ${label} de ${app}`,
      body: `${label} voltou para ${formatValue(value, unit)}. Limite: ${formatValue(rule.threshold, unit)}.`,
    };
  },
};

export const buildAlertMessage = (
  event: AlertEvent,
  input: AlertMessageInput,
): NotificationMessage => ({
  event,
  ...ALERT_MESSAGES[event](input),
});

export interface UptimeMessageInput {
  app: string;
  url: string;
  statusCode?: number;
  latencyMs?: number;
}

const UPTIME_MESSAGES: Record<
  UptimeEvent,
  (input: UptimeMessageInput) => Omit<NotificationMessage, "event">
> = {
  downtime: ({ app, url, statusCode }) => ({
    title: `Aplicação fora do ar: ${app}`,
    body: statusCode ? `${url} respondeu ${statusCode}.` : `${url} não respondeu.`,
  }),
  recovery: ({ app, url, statusCode, latencyMs }) => ({
    title: `Aplicação de volta: ${app}`,
    body: `${url} voltou a responder (${statusCode} em ${latencyMs} ms).`,
  }),
};

export const buildUptimeMessage = (
  event: UptimeEvent,
  input: UptimeMessageInput,
): NotificationMessage => ({
  event,
  ...UPTIME_MESSAGES[event](input),
});
