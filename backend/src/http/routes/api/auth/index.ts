import type { Router } from "express";
import { container } from "@di/index";
import { AuthController } from "@controller/AuthController";
import { authMiddleware } from "@middleware/auth";
import { authRateLimit } from "@middleware/rateLimit";

/**
 * Rotas de autenticação → /api/auth
 * registry() é o contrato esperado pelo folderRouter do framework interno.
 *
 * `authRateLimit` cobre os endpoints que aceitam credenciais: sem ele, login e
 * refresh são um oráculo de força bruta sem custo para o atacante.
 */
export const registry = (router: Router): void => {
  const ctrl = container.get(AuthController);
  router.post("/register", authRateLimit, ctrl.register);
  router.post("/login", authRateLimit, ctrl.login);
  router.post("/refresh", authRateLimit, ctrl.refresh);
  router.post("/logout", ctrl.logout);
  router.get("/me", authMiddleware, ctrl.me);
};
