import type { NextFunction, Request, Response } from "express";
import { container } from "@di/index";
import { verifyAccessToken, type AccessTokenPayload } from "@auth/tokens";
import { SessionService } from "@service/SessionService";
import { ApiKeyService } from "@service/ApiKeyService";
import { withTransaction } from "@database/withTransaction";
import { HttpError } from "@functions/HttpError";
import type { Role } from "@prisma-generated/client";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AccessTokenPayload;
      /** Presente quando autenticado por API key (`cap_...`) em vez de JWT. */
      apiKey?: { organizationId: string; role: Role };
    }
  }
}

/** Autentica via API key `cap_...`: popula req.auth + req.apiKey e fixa a org. */
async function authenticateApiKey(req: Request, token: string): Promise<boolean> {
  const resolved = await container.get(ApiKeyService).verify(token);
  if (!resolved) return false;
  req.auth = { sub: `apikey:${resolved.keyId}`, email: "", name: resolved.name, sid: "" };
  req.apiKey = { organizationId: resolved.organizationId, role: resolved.role };
  // A org é fixada pela chave (não exige header x-organization-id).
  if (!req.headers["x-organization-id"]) req.headers["x-organization-id"] = resolved.organizationId;
  return true;
}

/**
 * Valida o Access Token (assinatura RS256 + claims) E se a sessão (`sid`)
 * continua ativa — garantindo revogação imediata mesmo com JWT ainda válido.
 * Aceita também API keys `cap_...` (para o app mobile/CLI).
 */
export async function authMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw HttpError.unauthorized();
    const token = header.slice(7);

    if (token.startsWith("cap_")) {
      if (!(await authenticateApiKey(req, token))) throw HttpError.unauthorized("API key inválida.");
      return next();
    }

    const payload = verifyAccessToken(token);
    const active = await withTransaction(() => container.get(SessionService).isActive(payload.sid));
    if (!active) throw HttpError.unauthorized("Sessão revogada ou expirada.");

    req.auth = payload;
    next();
  } catch (error) {
    next(error instanceof HttpError ? error : HttpError.unauthorized("Token inválido."));
  }
}

/**
 * Variante para SSE/EventSource (que não envia header Authorization):
 * aceita o access token também via query string `?access_token=`.
 */
export async function sseAuthMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : (req.query.access_token as string);
    if (!token) throw HttpError.unauthorized();

    const payload = verifyAccessToken(token);
    const active = await withTransaction(() => container.get(SessionService).isActive(payload.sid));
    if (!active) throw HttpError.unauthorized("Sessão revogada ou expirada.");

    req.auth = payload;
    next();
  } catch (error) {
    next(error instanceof HttpError ? error : HttpError.unauthorized("Token inválido."));
  }
}
