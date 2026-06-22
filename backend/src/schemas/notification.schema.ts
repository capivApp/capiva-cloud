import { z } from "zod";

export const notificationTypeEnum = z.enum([
  "DISCORD",
  "SLACK",
  "TELEGRAM",
  "TEAMS",
  "EMAIL",
  "RESEND",
  "LARK",
  "PUSH",
  "WEBHOOK",
]);

export const createNotificationChannelSchema = z.object({
  type: notificationTypeEnum,
  name: z.string().min(1),
  /** Config específica do tipo (webhookUrl | botToken+chatId | apiKey+to | expoTokens...). */
  config: z.record(z.string(), z.unknown()).default({}),
  /** Eventos que este canal escuta. */
  events: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
});

export type CreateNotificationChannelDTO = z.infer<typeof createNotificationChannelSchema>;
