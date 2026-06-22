/**
 * Adapters de notificação (Strategy por tipo de canal). Cada adapter recebe a
 * config decifrada e a mensagem, e dispara via webhook/API. Tudo best-effort.
 */
export interface NotificationMessage {
  event: string;
  title: string;
  body: string;
}

export interface NotificationAdapter {
  send(config: Record<string, unknown>, message: NotificationMessage): Promise<void>;
}

const post = async (url: string, body: unknown, headers: Record<string, string> = {}): Promise<void> => {
  await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
};

const text = (m: NotificationMessage) => `*${m.title}*\n${m.body}`;

/** Discord/Slack/Teams/Lark/webhook genérico: cada um tem um shape de payload. */
const discord: NotificationAdapter = { send: (c, m) => post(String(c.webhookUrl), { content: text(m) }) };
const slack: NotificationAdapter = { send: (c, m) => post(String(c.webhookUrl), { text: text(m) }) };
const teams: NotificationAdapter = { send: (c, m) => post(String(c.webhookUrl), { text: text(m) }) };
const lark: NotificationAdapter = { send: (c, m) => post(String(c.webhookUrl), { msg_type: "text", content: { text: text(m) } }) };
const webhook: NotificationAdapter = { send: (c, m) => post(String(c.webhookUrl), { event: m.event, title: m.title, body: m.body }) };

/** Telegram Bot API: botToken + chatId. */
const telegram: NotificationAdapter = {
  send: (c, m) => post(`https://api.telegram.org/bot${c.botToken}/sendMessage`, { chat_id: c.chatId, text: text(m), parse_mode: "Markdown" }),
};

/** Resend (email transacional): apiKey + from + to. */
const resend: NotificationAdapter = {
  send: (c, m) => post("https://api.resend.com/emails", { from: c.from, to: c.to, subject: m.title, text: m.body }, { Authorization: `Bearer ${c.apiKey}` }),
};

/** Email simples: reaproveita o webhook de um gateway SMTP→HTTP (config.webhookUrl). */
const email: NotificationAdapter = {
  send: (c, m) => post(String(c.webhookUrl ?? "http://localhost"), { to: c.to, subject: m.title, text: m.body }),
};

/** Expo push (app mobile): tokens[] → exp.host. Pronto para o app Expo. */
const push: NotificationAdapter = {
  send: async (c, m) => {
    const tokens = (c.expoTokens as string[] | undefined) ?? [];
    if (tokens.length === 0) return;
    await post("https://exp.host/--/api/v2/push/send", tokens.map((to) => ({ to, title: m.title, body: m.body, data: { event: m.event } })));
  },
};

const ADAPTERS: Record<string, NotificationAdapter> = {
  DISCORD: discord,
  SLACK: slack,
  TEAMS: teams,
  LARK: lark,
  WEBHOOK: webhook,
  TELEGRAM: telegram,
  RESEND: resend,
  EMAIL: email,
  PUSH: push,
};

/** Factory: resolve o adapter pelo tipo do canal. */
export function notificationAdapterFor(type: string): NotificationAdapter {
  const adapter = ADAPTERS[type];
  if (!adapter) throw new Error(`Tipo de notificação não suportado: ${type}`);
  return adapter;
}
