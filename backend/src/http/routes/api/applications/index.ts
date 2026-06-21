import type { Router } from "express";
import { container } from "@di/index";
import { ApplicationController } from "@controller/ApplicationController";
import { ObservabilityController } from "@controller/ObservabilityController";
import { authMiddleware } from "@middleware/auth";

/** Rotas de aplicações → /api/applications (todas autenticadas). */
export const middlewares = [authMiddleware];

export const registry = (router: Router): void => {
  const ctrl = container.get(ApplicationController);
  const obs = container.get(ObservabilityController);
  router.get("/", ctrl.list);
  router.post("/", ctrl.create);
  router.get("/:id", ctrl.get);
  router.get("/:id/deployments", ctrl.listDeployments);
  router.post("/:id/deploy", ctrl.deploy);
  router.get("/:id/dependencies", ctrl.listDependencies);
  router.post("/:id/dependencies", ctrl.connectDependency);
  router.delete("/:id/dependencies/:depId", ctrl.disconnectDependency);
  router.get("/:id/metrics", obs.metrics);
  router.patch("/:id/strategy", ctrl.updateStrategy);
  router.post("/:id/rollback", ctrl.rollback);
  router.post("/:id/promote", ctrl.promote);
  router.post("/:id/stop", ctrl.stop);
  router.post("/:id/start", ctrl.start);
  router.post("/:id/restart", ctrl.restart);
  router.patch("/:id/tags", ctrl.updateTags);
  router.delete("/:id", ctrl.remove);
};
