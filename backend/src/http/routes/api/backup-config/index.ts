import type { Router } from "express";
import { container } from "@di/index";
import { BackupConfigController } from "@controller/BackupConfigController";
import { authMiddleware } from "@middleware/auth";

export const middlewares = [authMiddleware];

export const registry = (router: Router): void => {
  const ctrl = container.get(BackupConfigController);
  router.get("/", ctrl.get);
  router.put("/", ctrl.save);
};
