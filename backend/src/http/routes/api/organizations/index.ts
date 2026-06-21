import type { Router } from "express";
import { container } from "@di/index";
import { OrganizationController } from "@controller/OrganizationController";
import { authMiddleware } from "@middleware/auth";

/** Rotas de organizações → /api/organizations (autenticadas). */
export const middlewares = [authMiddleware];

export const registry = (router: Router): void => {
  const ctrl = container.get(OrganizationController);
  router.get("/", ctrl.list);
  router.post("/", ctrl.create);
};
