import type { NextFunction, Request, Response } from "express";
import { container } from "@di/index";
import { OrganizationService } from "@service/OrganizationService";
import { HttpError } from "@functions/HttpError";
import type { Role } from "@prisma-generated/client";

const ROLE_ORDER: Role[] = ["VIEWER", "DEVELOPER", "ADMIN", "OWNER"];

/**
 * Exige um papel mínimo na organização do recurso. A org pode vir de
 * params/header. Depende de authMiddleware ter populado req.auth (ou req.apiKey).
 */
export function requireRole(minimum: Role) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.auth) throw HttpError.unauthorized();
      const organizationId =
        (req.params.organizationId as string) || (req.headers["x-organization-id"] as string);
      if (!organizationId) throw HttpError.badRequest("Organização não informada.");

      // Autenticação por API key: o papel vem da própria chave (sem membership).
      if (req.apiKey) {
        if (req.apiKey.organizationId !== organizationId) throw HttpError.forbidden("Chave de outra organização.");
        if (ROLE_ORDER.indexOf(req.apiKey.role) < ROLE_ORDER.indexOf(minimum)) {
          throw HttpError.forbidden("Permissão insuficiente para esta chave.");
        }
        return next();
      }

      await container.get(OrganizationService).assertRole(req.auth.sub, organizationId, minimum);
      next();
    } catch (error) {
      next(error);
    }
  };
}
