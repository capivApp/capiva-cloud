import { z } from "zod";
import { ALERT_METRICS, ALERT_OPERATORS } from "@interface/alerts";

const metric = z.enum(ALERT_METRICS, "Escolha uma métrica válida.");
const operator = z.enum(ALERT_OPERATORS, "Escolha acima ou abaixo do limite.");
const threshold = z.number("Informe o limite.").min(0, "O limite não pode ser negativo.");
const windowMinutes = z
  .number("Informe a janela em minutos.")
  .int("A janela é em minutos inteiros.")
  .min(1, "A janela mínima é de 1 minuto.")
  .max(60, "A janela máxima é de 60 minutos.");

export const createAlertRuleSchema = z.object({
  metric,
  operator: operator.default("GT"),
  threshold,
  windowMinutes: windowMinutes.default(5),
  enabled: z.boolean().default(true),
});

// Sem defaults de propósito: no PATCH, campo ausente fica como está.
export const updateAlertRuleSchema = z.object({
  metric: metric.optional(),
  operator: operator.optional(),
  threshold: threshold.optional(),
  windowMinutes: windowMinutes.optional(),
  enabled: z.boolean().optional(),
});

export type CreateAlertRuleDTO = z.infer<typeof createAlertRuleSchema>;
export type UpdateAlertRuleDTO = z.infer<typeof updateAlertRuleSchema>;
