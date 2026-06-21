import type { Router } from "express";
import { container } from "@di/index";
import { ProjectController } from "@controller/ProjectController";
import { authMiddleware } from "@middleware/auth";

export const middlewares = [authMiddleware];

export const registry = (router: Router): void => {
  const ctrl = container.get(ProjectController);
  router.get("/", ctrl.list);
  router.post("/", ctrl.create);
  router.patch("/:id", ctrl.update);
  router.delete("/:id", ctrl.remove);
};
