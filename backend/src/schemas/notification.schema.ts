import { z } from "zod";

export const notificationTypeEnum = z.enum([
  "DISCORD",
  "SLACK",
  "TELEGRAM",
  "TEAMS",
  "EMAIL",
  "RESEND",
  "CAPIVAPP_EMAIL",
  "LARK",
  "PUSH",
  "WEBHOOK",
]);

export const DESTINATARIOS_INVALIDOS = "Informe ao menos um e-mail válido em Destinatários.";

const splitDestinatarios = (value: unknown): unknown =>
  typeof value === "string"
    ? value
        .split(/[,;]/)
        .map((e) => e.trim())
        .filter(Boolean)
    : value;

/** Destinatários do e-mail: texto separado por vírgula/ponto e vírgula ou array. */
export const destinatariosSchema = z.preprocess(
  splitDestinatarios,
  z.array(z.email({ error: DESTINATARIOS_INVALIDOS }), { error: DESTINATARIOS_INVALIDOS }).min(1, { error: DESTINATARIOS_INVALIDOS }),
);

/**
 * Config validada por tipo (Strategy). Tipos sem entrada aceitam config livre,
 * como sempre aceitaram.
 */
const CONFIG_SCHEMAS: Partial<Record<z.infer<typeof notificationTypeEnum>, z.ZodType>> = {
  CAPIVAPP_EMAIL: z.object({ to: destinatariosSchema }),
};

export const createNotificationChannelSchema = z
  .object({
    type: notificationTypeEnum,
    name: z.string().min(1),
    /** Config específica do tipo (webhookUrl | botToken+chatId | apiKey+to | expoTokens...). */
    config: z.record(z.string(), z.unknown()).default({}),
    /** Eventos que este canal escuta. */
    events: z.array(z.string()).default([]),
    enabled: z.boolean().default(true),
  })
  .superRefine((dto, ctx) => {
    const result = CONFIG_SCHEMAS[dto.type]?.safeParse(dto.config);
    if (!result || result.success) return;
    // O caminho para no campo do formulário (config.to), não no índice da lista.
    for (const issue of result.error.issues) ctx.addIssue({ code: "custom", path: ["config", ...issue.path.slice(0, 1)], message: issue.message });
  });

export type CreateNotificationChannelDTO = z.infer<typeof createNotificationChannelSchema>;
