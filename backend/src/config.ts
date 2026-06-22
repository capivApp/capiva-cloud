/**
 * Carregado via bunfig `preload`. Garante variáveis de ambiente e defaults
 * antes de qualquer outro módulo. Não colocar regra de negócio aqui.
 */
import "reflect-metadata";

process.env.NODE_ENV ??= "development";

/**
 * Bun + @kubernetes/client-node: o Bun ignora o https.Agent (CA/skip-verify) que
 * o client-node usa, então clusters com certificado self-signed (k3s/on-prem)
 * dão "self signed certificate in chain". Habilitamos a aceitação desses certs
 * para o control plane (que gerencia clusters próprios). Desligue em produção
 * com CA pública via CAPIVA_K8S_INSECURE_TLS=false.
 */
if (process.env.CAPIVA_K8S_INSECURE_TLS !== "false") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}
process.env.PORT ??= "3000";
process.env.ACCESS_TOKEN_TTL ??= "15m";
process.env.REFRESH_TOKEN_TTL_MS ??= String(7 * 24 * 60 * 60 * 1000);
process.env.JWT_ISSUER ??= "capiva-cloud";
process.env.JWT_AUDIENCE ??= "capiva-cloud-client";
process.env.DATABASE_PROVIDER ??= "postgresql";

export const config = {
  env: process.env.NODE_ENV,
  port: Number(process.env.PORT),
  /** Porta dedicada do WebSocket nativo do terminal web (default: PORT + 1). */
  terminalPort: Number(process.env.TERMINAL_WS_PORT ?? Number(process.env.PORT) + 1),
  publicUrl: process.env.PUBLIC_URL ?? `http://localhost:${process.env.PORT}`,
  databaseProvider: process.env.DATABASE_PROVIDER as "postgresql" | "mysql" | "sqlite",
  auth: {
    accessTtl: process.env.ACCESS_TOKEN_TTL!,
    refreshTtlMs: Number(process.env.REFRESH_TOKEN_TTL_MS),
    issuer: process.env.JWT_ISSUER!,
    audience: process.env.JWT_AUDIENCE!,
    cookieSecure: process.env.COOKIE_SECURE === "true",
  },
  encryptionKey: process.env.ENCRYPTION_KEY ?? "change-me-32-bytes-key-000000000000",
  s3: {
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION,
    bucket: process.env.S3_BUCKET,
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },
} as const;
