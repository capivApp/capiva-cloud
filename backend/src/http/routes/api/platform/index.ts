import type { Router } from "express";
import { container } from "@di/index";
import { PlatformController } from "@controller/PlatformController";
import { authMiddleware } from "@middleware/auth";

export const middlewares = [authMiddleware];

export const registry = (router: Router): void => {
  const ctrl = container.get(PlatformController);
  router.get("/releases", ctrl.releaseSummary);
  router.get("/fleet", ctrl.fleetView);
};
