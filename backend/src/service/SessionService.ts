import { Injectable } from "@di/index";
import { SessionRepository } from "@repository/SessionRepository";
import { AuditRepository } from "@repository/AuditRepository";
import {
  generateRefreshToken,
  hashRefreshToken,
} from "@auth/tokens";
import type { SessionDevice } from "@auth/fingerprint";
import { HttpError } from "@functions/HttpError";
import { config } from "../config";
import type { Session } from "@prisma-generated/client";

export interface IssuedSession {
  session: Session;
  /** valor cru do refresh token — vai apenas para o cookie HttpOnly */
  refreshToken: string;
}

/**
 * Regras de sessão/refresh token: rotação a cada uso, detecção de reuso
 * (revoga todas as sessões), revogação por sessão e global, multi-dispositivo.
 *
 * Persistido via SessionRepository (suporta múltiplas instâncias do control
 * plane). Executa SEMPRE dentro de uma transação aberta pelo AuthService.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly audit: AuditRepository,
  ) {}

  async create(userId: string, device: SessionDevice): Promise<IssuedSession> {
    const refreshToken = generateRefreshToken();
    const session = await this.sessions.create({
      userId,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: new Date(Date.now() + config.auth.refreshTtlMs),
      ip: device.ip,
      userAgent: device.userAgent,
      fingerprint: device.fingerprint,
    });
    await this.audit.record({ event: "LOGIN", userId, sessionId: session.id, ip: device.ip });
    return { session, refreshToken };
  }

  /** Rotaciona o refresh token apresentado, detectando reuso. */
  async rotate(presentedToken: string): Promise<IssuedSession> {
    const tokenHash = hashRefreshToken(presentedToken);
    const session = await this.sessions.findByTokenHash(tokenHash);

    // Token não está ativo: pode ser reuso de token já rotacionado → roubo.
    if (!session) {
      throw HttpError.unauthorized("Refresh token inválido.");
    }
    if (session.revoked) {
      // Reuso de token de sessão revogada → revoga TODAS as sessões do usuário.
      await this.sessions.revokeAllForUser(session.userId);
      await this.audit.record({
        event: "REUSE_DETECTED",
        userId: session.userId,
        sessionId: session.id,
        detail: "Refresh token de sessão revogada reutilizado.",
      });
      throw HttpError.unauthorized("Reuso de refresh token detectado. Sessões revogadas.");
    }
    if (session.expiresAt.getTime() < Date.now()) {
      await this.sessions.update(session.id, { revoked: true });
      throw HttpError.unauthorized("Refresh token expirado.");
    }

    const refreshToken = generateRefreshToken();
    const updated = await this.sessions.update(session.id, {
      tokenHash: hashRefreshToken(refreshToken),
      lastUsedAt: new Date(),
      expiresAt: new Date(Date.now() + config.auth.refreshTtlMs),
    });
    await this.audit.record({ event: "REFRESH", userId: session.userId, sessionId: session.id });
    return { session: updated, refreshToken };
  }

  async revokeByToken(presentedToken: string): Promise<void> {
    const session = await this.sessions.findByTokenHash(hashRefreshToken(presentedToken));
    if (!session) return;
    await this.sessions.update(session.id, { revoked: true });
    await this.audit.record({ event: "LOGOUT", userId: session.userId, sessionId: session.id });
  }

  async isActive(sessionId: string): Promise<boolean> {
    const session = await this.sessions.findById(sessionId);
    return Boolean(session && !session.revoked && session.expiresAt.getTime() >= Date.now());
  }

  listForUser(userId: string): Promise<Session[]> {
    return this.sessions.listActiveForUser(userId);
  }
}
