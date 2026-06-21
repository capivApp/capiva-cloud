import crypto from "crypto";
import jwt, { type SignOptions, type VerifyOptions } from "jsonwebtoken";
import { config } from "../config";
import { PRIVATE_KEY, PUBLIC_KEY } from "@auth/keys";

export interface AccessTokenPayload {
  sub: string; // userId
  email: string;
  name: string;
  sid: string; // session id
  iat?: number;
  exp?: number;
}

export interface AccessTokenInput {
  sub: string;
  email: string;
  name: string;
  sid: string;
}

/** Access Token: JWT RS256, curta duração, assinado com a chave PRIVADA. */
export function createAccessToken(input: AccessTokenInput): string {
  const options: SignOptions = {
    algorithm: "RS256",
    expiresIn: config.auth.accessTtl as SignOptions["expiresIn"],
    issuer: config.auth.issuer,
    audience: config.auth.audience,
  };
  return jwt.sign(input, PRIVATE_KEY, options);
}

/** Verifica o Access Token usando a chave PÚBLICA. */
export function verifyAccessToken(token: string): AccessTokenPayload {
  const options: VerifyOptions = {
    algorithms: ["RS256"],
    issuer: config.auth.issuer,
    audience: config.auth.audience,
  };
  return jwt.verify(token, PUBLIC_KEY, options) as AccessTokenPayload;
}

/** Refresh Token: opaco (NÃO é JWT), alta entropia. */
export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString("base64url");
}

/** Hash determinístico do refresh token — armazenamos só o hash. */
export function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
