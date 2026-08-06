import type { NextFunction, Request, Response } from "express";

/**
 * Cabeçalhos de segurança da resposta (equivalente ao essencial do Helmet, sem
 * dependência nova).
 *
 * A API responde JSON, então não há CSP de página a definir — o `frame-ancestors`
 * e o `default-src 'none'` bloqueiam qualquer tentativa de renderizar/embutir a
 * resposta. O SPA é servido pelo nginx, que tem a própria política.
 */
const HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
};

/** HSTS só faz sentido atrás de TLS; forçar em HTTP puro trava o painel local. */
const hstsValue = "max-age=31536000; includeSubDomains";

export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  for (const [name, value] of Object.entries(HEADERS)) res.setHeader(name, value);
  if (req.secure || req.headers["x-forwarded-proto"] === "https") {
    res.setHeader("Strict-Transport-Security", hstsValue);
  }
  res.removeHeader("X-Powered-By");
  next();
}
