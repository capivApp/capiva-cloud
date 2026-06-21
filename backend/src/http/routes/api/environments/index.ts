import type { Router } from "express";
import { container } from "@di/index";
import { EnvironmentController } from "@controller/EnvironmentController";
import { authMiddleware } from "@middleware/auth";

export const middlewares = [authMiddleware];

export const registry = (router: Router): void => {
  const ctrl = container.get(EnvironmentController);
  router.get("/", ctrl.list);
  router.post("/", ctrl.create);
  router.patch("/:id", ctrl.update);
  router.delete("/:id", ctrl.remove);
};
