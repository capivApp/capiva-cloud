import crypto from "crypto";
import type { Request } from "express";

export interface SessionDevice {
  ip?: string;
  userAgent?: string;
  fingerprint: string;
}

/** Deriva o "device" da requisição: IP + User-Agent + fingerprint (hash). */
export function buildDevice(req: Request): SessionDevice {
  const ip = req.ip || req.socket.remoteAddress || undefined;
  const userAgent = req.headers["user-agent"] || undefined;
  const fingerprint = crypto
    .createHash("sha256")
    .update(`${ip ?? ""}|${userAgent ?? ""}`)
    .digest("hex");
  return { ip, userAgent, fingerprint };
}
