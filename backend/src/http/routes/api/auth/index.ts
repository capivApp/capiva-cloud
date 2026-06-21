import type { Router } from "express";
import { container } from "@di/index";
import { AuthController } from "@controller/AuthController";
import { authMiddleware } from "@middleware/auth";

/**
 * Rotas de autenticação → /api/auth
 * registry() é o contrato esperado pelo folderRouter do framework interno.
 */
export const registry = (router: Router): void => {
  const ctrl = container.get(AuthController);
  router.post("/register", ctrl.register);
  router.post("/login", ctrl.login);
  router.post("/refresh", ctrl.refresh);
  router.post("/logout", ctrl.logout);
  router.get("/me", authMiddleware, ctrl.me);
};
