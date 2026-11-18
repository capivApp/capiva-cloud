import { HttpError } from "@functions/HttpError";
import { DESTINATARIOS_INVALIDOS, destinatariosSchema } from "@schemas/notification.schema";
import type { NotificationAdapter, NotificationMessage } from "@infra/notifications/adapters";

/**
 * Canal "E-mail da CapivApp": envia pelo mail-send (microserviço de e-mail da
 * CapivApp) com a credencial da própria plataforma. O usuário só informa os
 * destinatários; remetente é sempre noreply@capivapp.com.br com o nome abaixo.
 */
export interface MailSendSettings {
  /** MAIL_SEND_URL */
  url: string;
  /** MAIL_SEND_TOKEN (token deste app no mail-send). */
  token: string | undefined;
  /** EMAIL_NOME: nome do remetente. */
  nome: string;
}

export type MailSendFetch = (url: string, init: RequestInit) => Promise<Response>;

// Sem MAIL_SEND_TOKEN o servidor não fala com o mail-send. O texto vai para a
// tela (teste do canal), por isso não cita a variável.
const SEM_TOKEN = "O e-mail da CapivApp não está disponível neste servidor. Use outro canal ou fale com o suporte.";
const FALHA_SEM_DETALHE = "Não foi possível enviar o e-mail. Tente de novo em instantes.";

const requireToken = (token: string | undefined): string => {
  const value = token?.trim();
  if (!value) throw HttpError.serviceUnavailable(SEM_TOKEN);
  return value;
};

const requireDestinatarios = (to: unknown): string[] => {
  const result = destinatariosSchema.safeParse(to);
  if (!result.success) throw HttpError.badRequest(DESTINATARIOS_INVALIDOS);
  return result.data;
};

const readMensagemDeErro = async (res: Response): Promise<string | undefined> => {
  const body = (await res.json().catch(() => undefined)) as { message?: unknown } | undefined;
  return typeof body?.message === "string" && body.message ? body.message : undefined;
};

const requireAceito = async (res: Response): Promise<void> => {
  if (res.ok) return;
  const message = await readMensagemDeErro(res);
  throw new HttpError(message ? `Não foi possível enviar o e-mail: ${message}` : FALHA_SEM_DETALHE, 502, "MAIL_SEND_FAILED");
};

const buildEmail = (nome: string, para: string[], m: NotificationMessage) => ({ nome, para, assunto: m.title, texto: m.body });

/** Factory do adapter: settings e fetch injetáveis (testes trocam o fetch). */
export function buildMailSendAdapter(settings: MailSendSettings, send: MailSendFetch = fetch): NotificationAdapter {
  return {
    send: async (config, message) => {
      const token = requireToken(settings.token);
      const para = requireDestinatarios(config.to);
      const res = await send(`${settings.url.replace(/\/+$/, "")}/v1/emails`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(buildEmail(settings.nome, para, message)),
      });
      await requireAceito(res);
    },
  };
}
