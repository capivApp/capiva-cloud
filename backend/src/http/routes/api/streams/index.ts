import type { Router } from "express";
import { container } from "@di/index";
import { ObservabilityController } from "@controller/ObservabilityController";
import { sseAuthMiddleware } from "@middleware/auth";

/**
 * Streams SSE → /api/streams/*. Sem authMiddleware global porque EventSource
 * não envia header Authorization; usamos sseAuthMiddleware (token via query).
 */
export const registry = (router: Router): void => {
  const obs = container.get(ObservabilityController);
  router.get("/applications/:id/logs", sseAuthMiddleware, obs.streamLogs);
  router.get("/applications/:id/metrics", sseAuthMiddleware, obs.streamMetrics);
  router.get("/applications/:id/scaling", sseAuthMiddleware, obs.streamScaling);
  router.get("/deployments/:deploymentId", sseAuthMiddleware, obs.streamDeployment);
  router.get("/deployments/:deploymentId/build-logs", sseAuthMiddleware, obs.streamBuildLogs);
  router.get("/databases/:id", sseAuthMiddleware, obs.streamDatabase);
};
