import type { NextFunction, Request, Response } from "express";
import { container } from "@di/index";
import { verifyAccessToken, type AccessTokenPayload } from "@auth/tokens";
import { SessionService } from "@service/SessionService";
import { withTransaction } from "@database/withTransaction";
import { HttpError } from "@functions/HttpError";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AccessTokenPayload;
    }
  }
}

/**
 * Valida o Access Token (assinatura RS256 + claims) E se a sessão (`sid`)
 * continua ativa — garantindo revogação imediata mesmo com JWT ainda válido.
 */
export async function authMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw HttpError.unauthorized();

    const payload = verifyAccessToken(header.slice(7));
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
