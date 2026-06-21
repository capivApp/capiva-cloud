import type { Router } from "express";
import { container } from "@di/index";
import { WorkloadController } from "@controller/WorkloadController";
import { authMiddleware } from "@middleware/auth";

export const middlewares = [authMiddleware];

export const registry = (router: Router): void => {
  const ctrl = container.get(WorkloadController);
  router.get("/", ctrl.listWorkers);
  router.post("/", ctrl.createWorker);
  router.patch("/:id", ctrl.updateWorker);
};
