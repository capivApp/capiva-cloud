import type { Router } from "express";
import { container } from "@di/index";
import { ApiKeyController } from "@controller/ApiKeyController";
import { authMiddleware } from "@middleware/auth";
import { requireRole } from "@middleware/rbac";

/** API/CLI keys da organização → /api/api-keys (gestão exige ADMIN+). */
export const middlewares = [authMiddleware];

export const registry = (router: Router): void => {
  const ctrl = container.get(ApiKeyController);
  router.get("/", ctrl.list);
  router.post("/", requireRole("ADMIN"), ctrl.create);
  router.delete("/:id", requireRole("ADMIN"), ctrl.remove);
};
