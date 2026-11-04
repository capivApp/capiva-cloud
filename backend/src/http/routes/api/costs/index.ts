import type { Router } from "express";
import { container } from "@di/index";
import { FinOpsController } from "@controller/FinOpsController";
import { authMiddleware } from "@middleware/auth";

/** Custo mensal estimado → /api/costs (autenticadas, leitura). */
export const middlewares = [authMiddleware];

export const registry = (router: Router): void => {
  const ctrl = container.get(FinOpsController);
  router.get("/", ctrl.getCosts);
  router.get("/estimate/application", ctrl.estimateAplicacao);
};
