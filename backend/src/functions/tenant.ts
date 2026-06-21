import type { Request } from "express";
import { HttpError } from "@functions/HttpError";

/**
 * Extrai a organização ativa do header `x-organization-id` (multi-tenant).
 * Em SSE/EventSource (sem headers customizados), aceita também a query `?org=`.
 */
export function tenantOf(req: Request): { organizationId: string } {
  const organizationId = (req.headers["x-organization-id"] as string) || (req.query.org as string);
  if (!organizationId) throw HttpError.badRequest("Organização não informada (x-organization-id).");
  return { organizationId };
}
