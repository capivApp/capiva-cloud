import type { Router } from "express";
import { container } from "@di/index";
import { GitConnectionController } from "@controller/GitConnectionController";
import { GitController } from "@controller/GitController";
import { authMiddleware } from "@middleware/auth";

export const middlewares = [authMiddleware];

export const registry = (router: Router): void => {
  const ctrl = container.get(GitConnectionController);
  const git = container.get(GitController);
  router.get("/", ctrl.list);
  router.post("/", ctrl.create);
  router.patch("/:id", ctrl.update);
  router.delete("/:id", ctrl.remove);
  router.get("/:id/repos", git.repos);
  router.get("/:id/branches", git.branches);
  router.get("/:id/detect", git.detect);
};
