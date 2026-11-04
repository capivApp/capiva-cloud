/**
 * Adapter PUSH (Expo): o `data` da mensagem chega ao app para o deep link
 * (toque na notificação abre a aplicação). `fetch` mockado, sem rede.
 */
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { notificationAdapterFor } from "@infra/notifications/adapters";

const originalFetch = globalThis.fetch;
let fetchMock: ReturnType<typeof mock>;

const sentBody = (): { to: string; data: Record<string, string> }[] => {
  const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
  return JSON.parse(init?.body as string);
};

describe("adapter PUSH", () => {
  beforeEach(() => {
    fetchMock = mock(async () => new Response("{}"));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("envia o applicationId no data junto com o evento", async () => {
    await notificationAdapterFor("PUSH").send(
      { expoTokens: ["ExponentPushToken[a]", "ExponentPushToken[b]"] },
      { event: "deploy.succeeded", title: "t", body: "b", data: { applicationId: "app-1", deploymentId: "dep-1" } },
    );

    expect(sentBody()).toHaveLength(2);
    expect(sentBody()[0]).toMatchObject({
      to: "ExponentPushToken[a]",
      data: { event: "deploy.succeeded", applicationId: "app-1", deploymentId: "dep-1" },
    });
  });

  it("sem data mantém só o evento", async () => {
    await notificationAdapterFor("PUSH").send({ expoTokens: ["ExponentPushToken[a]"] }, { event: "test", title: "t", body: "b" });
    expect(sentBody()[0]?.data).toEqual({ event: "test" });
  });

  it("o evento da mensagem não é sobrescrito pelo data", async () => {
    await notificationAdapterFor("PUSH").send({ expoTokens: ["ExponentPushToken[a]"] }, { event: "deploy.failed", title: "t", body: "b", data: { event: "outro" } });
    expect(sentBody()[0]?.data.event).toBe("deploy.failed");
  });

  it("sem tokens não chama a API da Expo", async () => {
    await notificationAdapterFor("PUSH").send({}, { event: "test", title: "t", body: "b" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
