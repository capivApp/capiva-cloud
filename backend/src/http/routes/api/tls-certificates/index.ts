import type { Router } from "express";
import { container } from "@di/index";
import { TlsCertificateController } from "@controller/TlsCertificateController";
import { authMiddleware } from "@middleware/auth";
import { requireRole } from "@middleware/rbac";

/** Certificados TLS da organização → /api/tls-certificates (autenticadas). */
export const middlewares = [authMiddleware];

export const registry = (router: Router): void => {
  const ctrl = container.get(TlsCertificateController);
  router.get("/", ctrl.list);
  router.post("/", requireRole("ADMIN"), ctrl.create);
  router.delete("/:id", requireRole("ADMIN"), ctrl.remove);
};
