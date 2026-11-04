import type { NextFunction, Request, Response } from "express";
import { HttpError } from "@functions/HttpError";

/**
 * Rate limit por janela fixa, em memória.
 *
 * Serve para conter força bruta em login/registro e abuso de endpoints caros.
 * É POR PROCESSO: com N réplicas o teto efetivo é N × `max`. Para um limite
 * global exato (ou proteção contra DDoS distribuído) o lugar certo é o edge
 * (Traefik/WAF); aqui o objetivo é tornar inviável a enumeração de senhas.
 */
export interface RateLimitOptions {
  /** Tamanho da janela em milissegundos. */
  windowMs: number;
  /** Requisições permitidas por chave dentro da janela. */
  max: number;
  /** Identificador do cliente. Default: IP. */
  keyBy?: (req: Request) => string;
  message?: string;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const clientIp = (req: Request): string => req.ip ?? req.socket.remoteAddress ?? "unknown";

export function rateLimit(options: RateLimitOptions) {
  const {
    windowMs,
    max,
    keyBy = clientIp,
    message = "Muitas requisições. Tente novamente em instantes.",
  } = options;
  const buckets = new Map<string, Bucket>();

  /** Remove janelas expiradas para o mapa não crescer sem limite. */
  const sweep = (now: number): void => {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  };

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    if (buckets.size > 10_000) sweep(now);

    const key = keyBy(req);
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      res.setHeader("RateLimit-Remaining", max - 1);
      return next();
    }

    bucket.count += 1;
    if (bucket.count > max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader("Retry-After", retryAfter);
      return next(HttpError.tooManyRequests(message));
    }

    res.setHeader("RateLimit-Remaining", Math.max(0, max - bucket.count));
    next();
  };
}

/** Limite estrito para credenciais: chaveado por IP + e-mail informado. */
export const authRateLimit = rateLimit({
  windowMs: 15 * 60_000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX ?? 10),
  keyBy: (req) => `${clientIp(req)}:${String((req.body as { email?: string })?.email ?? "")}`,
  message: "Muitas tentativas de autenticação. Aguarde alguns minutos.",
});

/** Limite geral da API autenticada — teto de abuso, não de uso legítimo. */
export const apiRateLimit = rateLimit({
  windowMs: 60_000,
  max: Number(process.env.API_RATE_LIMIT_MAX ?? 600),
});
