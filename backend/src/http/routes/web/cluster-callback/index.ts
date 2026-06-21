import express, { type Router } from "express";
import { container } from "@di/index";
import { ClusterCallbackController } from "@controller/ClusterCallbackController";

/**
 * Callback de auto-registro de cluster (modo copy-paste) → /webhooks/cluster-callback.
 * Público (o nó só tem o registrationToken de uso único). JSON.
 */
export const middlewares = [express.json({ limit: "5mb" })];

export const registry = (router: Router): void => {
  const ctrl = container.get(ClusterCallbackController);
  router.post("/", ctrl.handle);
};
