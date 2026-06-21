import type { NextFunction, Request, Response } from "express";
import { container } from "@di/index";
import { OrganizationService } from "@service/OrganizationService";
import { HttpError } from "@functions/HttpError";
import type { Role } from "@prisma-generated/client";

/**
 * Exige um papel mínimo na organização do recurso. A org pode vir de
 * params/header. Depende de authMiddleware ter populado req.auth.
 */
export function requireRole(minimum: Role) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.auth) throw HttpError.unauthorized();
      const organizationId =
        (req.params.organizationId as string) || (req.headers["x-organization-id"] as string);
      if (!organizationId) throw HttpError.badRequest("Organização não informada.");
      await container.get(OrganizationService).assertRole(req.auth.sub, organizationId, minimum);
      next();
    } catch (error) {
      next(error);
    }
  };
}
