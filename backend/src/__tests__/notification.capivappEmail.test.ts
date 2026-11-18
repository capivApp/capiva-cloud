import { describe, expect, it } from "bun:test";
import { buildMailSendAdapter, type MailSendSettings } from "@infra/notifications/mailSend";
import { notificationAdapterFor } from "@infra/notifications/adapters";
import { createNotificationChannelSchema } from "@schemas/notification.schema";
import { HttpError } from "@functions/HttpError";

interface Captured {
  url: string;
  init: RequestInit;
}

const SETTINGS: MailSendSettings = { url: "https://mail.capivapp.com.br", token: "tok_app", nome: "Capiva Cloud" };
const MESSAGE = { event: "deploy.failed", title: "Deploy falhou", body: "A aplicação api não subiu." };

const buildFakeFetch = (status = 202, body: unknown = { id: "eml_1", situacao: "pendente" }) => {
  const calls: Captured[] = [];
  const fakeFetch = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  };
  return { calls, fakeFetch };
};

const readBody = (call: Captured) => JSON.parse(String(call.init.body)) as Record<string, unknown>;
const readHeaders = (call: Captured) => new Headers(call.init.headers);

describe("canal CAPIVAPP_EMAIL (mail-send)", () => {
  it("é resolvido pela factory de adapters", () => {
    expect(notificationAdapterFor("CAPIVAPP_EMAIL")).toBeDefined();
  });

  it("envia para POST /v1/emails com o token da plataforma e o nome do remetente", async () => {
    const { calls, fakeFetch } = buildFakeFetch();
    await buildMailSendAdapter(SETTINGS, fakeFetch).send({ to: "ops@empresa.com" }, MESSAGE);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://mail.capivapp.com.br/v1/emails");
    expect(calls[0]!.init.method).toBe("POST");
    expect(readHeaders(calls[0]!).get("Authorization")).toBe("Bearer tok_app");
    expect(readHeaders(calls[0]!).get("Content-Type")).toBe("application/json");
    expect(readBody(calls[0]!)).toEqual({
      nome: "Capiva Cloud",
      para: ["ops@empresa.com"],
      assunto: "Deploy falhou",
      texto: "A aplicação api não subiu.",
    });
  });

  it("aceita vários destinatários separados por vírgula ou ponto e vírgula", async () => {
    const { calls, fakeFetch } = buildFakeFetch();
    await buildMailSendAdapter(SETTINGS, fakeFetch).send({ to: " a@x.com, b@x.com ;c@x.com " }, MESSAGE);
    expect(readBody(calls[0]!).para).toEqual(["a@x.com", "b@x.com", "c@x.com"]);
  });

  it("aceita a lista de destinatários já em array", async () => {
    const { calls, fakeFetch } = buildFakeFetch();
    await buildMailSendAdapter(SETTINGS, fakeFetch).send({ to: ["a@x.com", "b@x.com"] }, MESSAGE);
    expect(readBody(calls[0]!).para).toEqual(["a@x.com", "b@x.com"]);
  });

  it("não duplica a barra quando a URL termina com /", async () => {
    const { calls, fakeFetch } = buildFakeFetch();
    await buildMailSendAdapter({ ...SETTINGS, url: "http://localhost:4000/" }, fakeFetch).send({ to: "a@x.com" }, MESSAGE);
    expect(calls[0]!.url).toBe("http://localhost:4000/v1/emails");
  });

  it("sem token, falha com erro claro e não chama o serviço", async () => {
    const { calls, fakeFetch } = buildFakeFetch();
    const adapter = buildMailSendAdapter({ ...SETTINGS, token: undefined }, fakeFetch);

    const error = await adapter.send({ to: "a@x.com" }, MESSAGE).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).status).toBe(503);
    expect((error as HttpError).message).toBe("O e-mail da CapivApp não está disponível neste servidor. Use outro canal ou fale com o suporte.");
    expect(calls).toHaveLength(0);
  });

  it("token em branco conta como ausente", async () => {
    const { calls, fakeFetch } = buildFakeFetch();
    const error = await buildMailSendAdapter({ ...SETTINGS, token: "  " }, fakeFetch).send({ to: "a@x.com" }, MESSAGE).catch((e: unknown) => e);
    expect((error as HttpError).status).toBe(503);
    expect(calls).toHaveLength(0);
  });

  it("sem destinatário válido, falha sem chamar o serviço", async () => {
    const { calls, fakeFetch } = buildFakeFetch();
    const error = await buildMailSendAdapter(SETTINGS, fakeFetch).send({ to: "" }, MESSAGE).catch((e: unknown) => e);
    expect((error as HttpError).status).toBe(400);
    expect((error as HttpError).message).toBe("Informe ao menos um e-mail válido em Destinatários.");
    expect(calls).toHaveLength(0);
  });

  it("resposta de erro do mail-send vira erro com a mensagem do serviço", async () => {
    const { fakeFetch } = buildFakeFetch(400, { message: "Assunto obrigatório." });
    const error = await buildMailSendAdapter(SETTINGS, fakeFetch).send({ to: "a@x.com" }, MESSAGE).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).status).toBe(502);
    expect((error as HttpError).message).toBe("Não foi possível enviar o e-mail: Assunto obrigatório.");
  });

  it("resposta de erro sem corpo JSON ainda vira erro claro", async () => {
    const fakeFetch = async () => new Response("bad gateway", { status: 502 });
    const error = await buildMailSendAdapter(SETTINGS, fakeFetch).send({ to: "a@x.com" }, MESSAGE).catch((e: unknown) => e);
    expect((error as HttpError).message).toBe("Não foi possível enviar o e-mail. Tente de novo em instantes.");
  });
});

describe("createNotificationChannelSchema com CAPIVAPP_EMAIL", () => {
  const base = { type: "CAPIVAPP_EMAIL" as const, name: "E-mail do time", events: ["deploy.failed"] };

  it("aceita destinatários válidos", () => {
    expect(createNotificationChannelSchema.safeParse({ ...base, config: { to: "a@x.com, b@x.com" } }).success).toBe(true);
  });

  it("recusa sem destinatário, com a mensagem no campo config.to", () => {
    const result = createNotificationChannelSchema.safeParse({ ...base, config: {} });
    expect(result.success).toBe(false);
    expect(result.error!.issues).toContainEqual(
      expect.objectContaining({ path: ["config", "to"], message: "Informe ao menos um e-mail válido em Destinatários." }),
    );
  });

  it("recusa e-mail inválido na lista", () => {
    const result = createNotificationChannelSchema.safeParse({ ...base, config: { to: "a@x.com, nao-e-email" } });
    expect(result.success).toBe(false);
    expect(result.error!.issues[0]!.path).toEqual(["config", "to"]);
  });

  it("não exige credencial do Resend (a credencial é da plataforma)", () => {
    const result = createNotificationChannelSchema.safeParse({ ...base, config: { to: "a@x.com" } });
    expect(result.success).toBe(true);
  });

  it("mantém o RESEND aceitando a config antiga", () => {
    const result = createNotificationChannelSchema.safeParse({
      type: "RESEND",
      name: "Resend próprio",
      config: { apiKey: "re_123", from: "a@x.com", to: "b@x.com" },
    });
    expect(result.success).toBe(true);
  });
});
