import crypto from "crypto";
import { config } from "../config";

/**
 * Cifragem de credenciais em repouso (AES-256-GCM).
 * Usada para kubeconfig, tokens Git, secrets de app e credenciais S3.
 * Nunca armazenar segredos em texto puro.
 */
const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  // Deriva 32 bytes da chave configurada (aceita qualquer tamanho de entrada).
  return crypto.createHash("sha256").update(config.encryptionKey).digest();
}

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // formato: iv.tag.ciphertext (base64url)
  return [iv, tag, enc].map((b) => b.toString("base64url")).join(".");
}

export function decrypt(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  const iv = Buffer.from(ivB64, "base64url");
  const tag = Buffer.from(tagB64, "base64url");
  const data = Buffer.from(dataB64, "base64url");
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
