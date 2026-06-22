import type { Router } from "express";
import { container } from "@di/index";
import { StorageProviderController } from "@controller/StorageProviderController";
import { authMiddleware } from "@middleware/auth";
import { requireRole } from "@middleware/rbac";

/** Provedores de storage (S3) → /api/storage-providers (autenticadas). */
export const middlewares = [authMiddleware];

export const registry = (router: Router): void => {
  const ctrl = container.get(StorageProviderController);
  router.get("/", ctrl.list);
  router.post("/", requireRole("ADMIN"), ctrl.create);
  router.delete("/:id", requireRole("ADMIN"), ctrl.remove);
};
