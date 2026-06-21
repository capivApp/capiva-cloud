import type { Response } from "express";
import { config } from "../config";

export const REFRESH_COOKIE_NAME = "capiva_refresh";

/**
 * O cookie cobre /api/auth para chegar em /api/auth/refresh e /api/auth/logout,
 * ficando fora das demais rotas (refresh token não vaza para o resto da API).
 */
const COOKIE_PATH = "/api/auth";

/** Define o refresh token em cookie HttpOnly (inacessível via JS → imune a XSS). */
export function setRefreshCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: config.auth.cookieSecure,
    sameSite: "strict",
    path: COOKIE_PATH,
    expires: expiresAt,
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: config.auth.cookieSecure,
    sameSite: "strict",
    path: COOKIE_PATH,
  });
}
