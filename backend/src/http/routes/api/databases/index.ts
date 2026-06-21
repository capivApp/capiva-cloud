import type { Router } from "express";
import { container } from "@di/index";
import { DatabaseController } from "@controller/DatabaseController";
import { authMiddleware } from "@middleware/auth";

export const middlewares = [authMiddleware];

export const registry = (router: Router): void => {
  const ctrl = container.get(DatabaseController);
  router.get("/", ctrl.list);
  router.post("/", ctrl.create);
  router.get("/:id", ctrl.get);
  router.patch("/:id", ctrl.update);
  router.post("/:id/attach", ctrl.attach);
};
