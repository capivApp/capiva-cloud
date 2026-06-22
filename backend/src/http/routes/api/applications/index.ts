import type { Router } from "express";
import { container } from "@di/index";
import { ApplicationController } from "@controller/ApplicationController";
import { ObservabilityController } from "@controller/ObservabilityController";
import { authMiddleware } from "@middleware/auth";
import { requireRole } from "@middleware/rbac";

/** Rotas de aplicações → /api/applications (todas autenticadas). */
export const middlewares = [authMiddleware];

// Mutações (deploy/criar/alterar/remover) exigem DEVELOPER+. VIEWER só lê.
const dev = requireRole("DEVELOPER");

export const registry = (router: Router): void => {
  const ctrl = container.get(ApplicationController);
  const obs = container.get(ObservabilityController);
  router.get("/", ctrl.list);
  router.post("/", dev, ctrl.create);
  router.get("/:id", ctrl.get);
  router.get("/:id/deployments", ctrl.listDeployments);
  router.post("/:id/deploy", dev, ctrl.deploy);
  router.get("/:id/dependencies", ctrl.listDependencies);
  router.post("/:id/dependencies", dev, ctrl.connectDependency);
  router.delete("/:id/dependencies/:depId", dev, ctrl.disconnectDependency);
  router.get("/:id/metrics", obs.metrics);
  router.patch("/:id/strategy", dev, ctrl.updateStrategy);
  router.post("/:id/rollback", dev, ctrl.rollback);
  router.post("/:id/promote", dev, ctrl.promote);
  router.post("/:id/stop", dev, ctrl.stop);
  router.post("/:id/start", dev, ctrl.start);
  router.post("/:id/restart", dev, ctrl.restart);
  router.patch("/:id/tags", dev, ctrl.updateTags);
  router.patch("/:id/tls", dev, ctrl.updateTls);
  router.get("/:id/volumes", ctrl.listVolumes);
  router.post("/:id/volumes", dev, ctrl.addVolume);
  router.get("/:id/volumes/:volId/backups", ctrl.listVolumeBackups);
  router.post("/:id/volumes/:volId/backups", dev, ctrl.createVolumeBackup);
  router.post("/:id/volumes/:volId/backups/:backupId/restore", dev, ctrl.restoreVolumeBackup);
  router.delete("/:id/volumes/:volId", dev, ctrl.removeVolume);
  router.get("/:id/uptime-checks", ctrl.listUptimeChecks);
  router.post("/:id/uptime-checks", dev, ctrl.createUptimeCheck);
  router.post("/:id/uptime-checks/:checkId/run", dev, ctrl.runUptimeCheck);
  router.delete("/:id/uptime-checks/:checkId", dev, ctrl.removeUptimeCheck);
  router.get("/:id/reports", ctrl.reportsView);
  router.delete("/:id", dev, ctrl.remove);
};
