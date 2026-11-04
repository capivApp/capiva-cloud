/// <reference types="bun" />
/**
 * Deep link do push: o `data` da notificação Expo vira a rota da aplicação.
 * Função pura, sem expo-notifications.
 */
import { describe, expect, test } from "bun:test";
import { buildNotificationHref } from "@/lib/notifications";

describe("buildNotificationHref", () => {
  test("com applicationId abre a tela da aplicação", () => {
    expect(buildNotificationHref({ event: "deploy.succeeded", applicationId: "app-1" })).toEqual({
      pathname: "/apps/[id]",
      params: { id: "app-1" },
    });
  });

  test("sem applicationId não navega", () => {
    expect(buildNotificationHref({ event: "test" })).toBeNull();
    expect(buildNotificationHref({ applicationId: "" })).toBeNull();
    expect(buildNotificationHref({ applicationId: 42 })).toBeNull();
  });

  test("payload ausente ou inválido não navega", () => {
    expect(buildNotificationHref(undefined)).toBeNull();
    expect(buildNotificationHref(null)).toBeNull();
    expect(buildNotificationHref("app-1")).toBeNull();
  });
});
