import type { Router } from "express";
import { container } from "@di/index";
import { NotificationController } from "@controller/NotificationController";
import { authMiddleware } from "@middleware/auth";
import { requireRole } from "@middleware/rbac";

/** Canais de notificação da org → /api/notifications (gestão exige ADMIN+). */
export const middlewares = [authMiddleware];

export const registry = (router: Router): void => {
  const ctrl = container.get(NotificationController);
  router.get("/events", ctrl.events);
  router.get("/", ctrl.list);
  router.post("/", requireRole("ADMIN"), ctrl.create);
  router.post("/:id/test", requireRole("ADMIN"), ctrl.test);
  router.delete("/:id", requireRole("ADMIN"), ctrl.remove);
};
