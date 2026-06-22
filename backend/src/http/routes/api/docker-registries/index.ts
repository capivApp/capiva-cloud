import type { Router } from "express";
import { container } from "@di/index";
import { DockerRegistryController } from "@controller/DockerRegistryController";
import { authMiddleware } from "@middleware/auth";
import { requireRole } from "@middleware/rbac";

/** Registries Docker privados → /api/docker-registries (autenticadas). */
export const middlewares = [authMiddleware];

export const registry = (router: Router): void => {
  const ctrl = container.get(DockerRegistryController);
  router.get("/", ctrl.list);
  router.post("/", requireRole("ADMIN"), ctrl.create);
  router.delete("/:id", requireRole("ADMIN"), ctrl.remove);
};
