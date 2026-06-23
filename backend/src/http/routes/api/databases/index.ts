import type { Router } from "express";
import { container } from "@di/index";
import { DatabaseController } from "@controller/DatabaseController";
import { authMiddleware } from "@middleware/auth";
import { requireRole } from "@middleware/rbac";

export const middlewares = [authMiddleware];

const dev = requireRole("DEVELOPER");

export const registry = (router: Router): void => {
  const ctrl = container.get(DatabaseController);
  router.get("/", ctrl.list);
  router.post("/", dev, ctrl.create);
  router.get("/:id", ctrl.get);
  router.patch("/:id", dev, ctrl.update);
  router.delete("/:id", dev, ctrl.remove);
  router.post("/:id/attach", dev, ctrl.attach);
  router.get("/:id/backups", ctrl.listBackups);
  router.post("/:id/backups", dev, ctrl.createBackup);
  router.post("/:id/backups/:backupId/restore", dev, ctrl.restoreBackup);
};
