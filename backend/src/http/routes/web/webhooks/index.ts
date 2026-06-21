import express, { type Router } from "express";
import { container } from "@di/index";
import { WebhookController } from "@controller/WebhookController";

/**
 * Webhooks Git → /webhooks/git/:connectionId (público, sem auth).
 * Usa corpo cru (express.raw) para validar a assinatura HMAC.
 */
export const middlewares = [express.raw({ type: "*/*", limit: "5mb" })];

export const registry = (router: Router): void => {
  const ctrl = container.get(WebhookController);
  router.post("/git/:connectionId", ctrl.handle);
};
