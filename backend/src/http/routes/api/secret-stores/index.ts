import type { Router } from "express";
import { container } from "@di/index";
import { SecretStoreController } from "@controller/SecretStoreController";
import { authMiddleware } from "@middleware/auth";
import { requireRole } from "@middleware/rbac";

/** Cofres externos (External Secrets) → /api/secret-stores (autenticadas). */
export const middlewares = [authMiddleware];

export const registry = (router: Router): void => {
  const ctrl = container.get(SecretStoreController);
  router.get("/", ctrl.list);
  router.get("/:id", ctrl.get);
  router.post("/", requireRole("ADMIN"), ctrl.create);
  router.delete("/:id", requireRole("ADMIN"), ctrl.remove);
};
