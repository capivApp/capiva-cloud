import type { Request, Response } from "express";
import { Injectable } from "@di/index";
import { AuthService } from "@service/AuthService";
import { registerSchema, loginSchema } from "@schemas/auth.schema";
import { buildDevice } from "@auth/fingerprint";
import { setRefreshCookie, clearRefreshCookie, REFRESH_COOKIE_NAME } from "@auth/cookie";
import type { AuthResult } from "@service/AuthService";

/**
 * Controller de autenticação. Apenas: valida entrada (Zod), chama Service e
 * responde — incluindo o set-cookie do refresh token (cookie-only).
 */
@Injectable()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  register = async (req: Request, res: Response): Promise<void> => {
    const input = registerSchema.parse(req.body);
    const result = await this.auth.register(input, buildDevice(req));
    this.respond(res, result, 201);
  };

  login = async (req: Request, res: Response): Promise<void> => {
    const input = loginSchema.parse(req.body);
    const result = await this.auth.login(input, buildDevice(req));
    this.respond(res, result, 200);
  };

  refresh = async (req: Request, res: Response): Promise<void> => {
    const token = req.cookies?.[REFRESH_COOKIE_NAME];
    const result = await this.auth.refresh(token);
    this.respond(res, result, 200);
  };

  logout = async (req: Request, res: Response): Promise<void> => {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE_NAME]);
    clearRefreshCookie(res);
    res.status(204).end();
  };

  me = async (req: Request, res: Response): Promise<void> => {
    res.json({ user: req.auth ? { id: req.auth.sub, email: req.auth.email, name: req.auth.name } : null });
  };

  private respond(res: Response, result: AuthResult, status: number): void {
    setRefreshCookie(res, result.refresh.refreshToken, result.refresh.session.expiresAt);
    res.status(status).json({ accessToken: result.accessToken, user: result.user });
  }
}
