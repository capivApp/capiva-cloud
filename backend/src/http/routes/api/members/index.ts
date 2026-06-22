import type { Router } from "express";
import { container } from "@di/index";
import { MembershipController } from "@controller/MembershipController";
import { authMiddleware } from "@middleware/auth";
import { requireRole } from "@middleware/rbac";

/**
 * Membros e convites da organização → /api/members (autenticadas).
 * Leitura: qualquer membro. Mutação (convidar/alterar papel/remover): ADMIN+.
 */
export const middlewares = [authMiddleware];

export const registry = (router: Router): void => {
  const ctrl = container.get(MembershipController);
  router.get("/", ctrl.listMembers);
  router.get("/invitations", ctrl.listInvitations);
  router.post("/invitations", requireRole("ADMIN"), ctrl.invite);
  router.post("/invitations/accept", ctrl.accept);
  router.delete("/invitations/:id", requireRole("ADMIN"), ctrl.revokeInvitation);
  router.patch("/:userId", requireRole("ADMIN"), ctrl.changeRole);
  router.delete("/:userId", requireRole("ADMIN"), ctrl.removeMember);
};
