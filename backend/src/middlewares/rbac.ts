import type { NextFunction, Request, Response } from "express";
import { container } from "@di/index";
import { OrganizationService } from "@service/OrganizationService";
import { HttpError } from "@functions/HttpError";
import type { Role } from "@prisma-generated/client";

const ROLE_ORDER: Role[] = ["VIEWER", "DEVELOPER", "ADMIN", "OWNER"];

const satisfies = (role: Role, minimum: Role): boolean =>
  ROLE_ORDER.indexOf(role) >= ROLE_ORDER.indexOf(minimum);

/**
 * Exige um papel mínimo na organização do recurso.
 *
 * `authMiddleware` já validou a associação e publicou `req.organizationRole`;
 * aqui só comparamos o papel. Rotas com `:organizationId` no path (fora do
 * header) caem no caminho de verificação explícita.
 */
export function requireRole(minimum: Role) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.auth) throw HttpError.unauthorized();

      const fromPath = req.params.organizationId as string | undefined;
      if (fromPath && fromPath !== req.organizationId) {
        if (req.apiKey) throw HttpError.forbidden("Chave de outra organização.");
        await container.get(OrganizationService).assertRole(req.auth.sub, fromPath, minimum);
        return next();
      }

      if (!req.organizationId || !req.organizationRole) {
        throw HttpError.badRequest("Organização não informada (x-organization-id).");
      }
      if (!satisfies(req.organizationRole, minimum)) {
        throw HttpError.forbidden("Permissão insuficiente nesta organização.");
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
