import type { Router } from "express";
import { container } from "@di/index";
import { EnvironmentController } from "@controller/EnvironmentController";
import { FinOpsController } from "@controller/FinOpsController";
import { authMiddleware } from "@middleware/auth";
import { requireRole } from "@middleware/rbac";

export const middlewares = [authMiddleware];

export const registry = (router: Router): void => {
  const ctrl = container.get(EnvironmentController);
  router.get("/", ctrl.list);
  router.post("/", ctrl.create);
  router.patch("/:id", ctrl.update);
  router.delete("/:id", ctrl.remove);

  const finops = container.get(FinOpsController);
  router.get("/:id/quota", finops.getQuota);
  router.put("/:id/quota", requireRole("ADMIN"), finops.setQuota);
};
