import type { Router } from "express";
import { container } from "@di/index";
import { AuditController } from "@controller/AuditController";
import { authMiddleware } from "@middleware/auth";
import { requireRole } from "@middleware/rbac";

/** Audit logs da organização → /api/audit (leitura ADMIN+). */
export const middlewares = [authMiddleware];

export const registry = (router: Router): void => {
  const ctrl = container.get(AuditController);
  router.get("/", requireRole("ADMIN"), ctrl.list);
};
