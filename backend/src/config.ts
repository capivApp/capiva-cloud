/**
 * Carregado via bunfig `preload`. Garante variáveis de ambiente e defaults
 * antes de qualquer outro módulo. Não colocar regra de negócio aqui.
 */
import "reflect-metadata";
import { z } from "zod";
import { installBunKubeFetchShim } from "@infra/kubernetes/nodeFetchShim";

// Mensagem de validação que ninguém escreveu à mão sai em português, não em inglês.
z.config(z.locales.pt());

process.env.NODE_ENV ??= "development";

/**
 * O Bun ignora as opções de TLS do https.Agent (CA e CLIENT certificate) que o
 * @kubernetes/client-node usa — sem o shim, a autenticação no API server falha
 * com 401. Ver nodeFetchShim.ts.
 *
 * A tolerância a certificados self-signed (k3s/on-prem) mora no shim e vale só
 * para as chamadas ao API server: `CAPIVA_K8S_INSECURE_TLS=true`. Desligar a
 * verificação no processo inteiro (NODE_TLS_REJECT_UNAUTHORIZED=0) exporia
 * também Git, S3, webhooks e notificações a man-in-the-middle.
 */
installBunKubeFetchShim();
process.env.PORT ??= "3000";
process.env.ACCESS_TOKEN_TTL ??= "15m";
process.env.REFRESH_TOKEN_TTL_MS ??= String(7 * 24 * 60 * 60 * 1000);
process.env.JWT_ISSUER ??= "capiva-cloud";
process.env.JWT_AUDIENCE ??= "capiva-cloud-client";
process.env.DATABASE_PROVIDER ??= "postgresql";

/** Chave de desenvolvimento — recusada em produção (ver assertProductionSecrets). */
const DEV_ENCRYPTION_KEY = "change-me-32-bytes-key-000000000000";

/**
 * Origens permitidas no CORS. Em produção painel e API compartilham origem
 * (nginx faz proxy de /api), então a lista só importa quando o front é servido
 * de outro host — daí ser configurável.
 */
const parseOrigins = (): string[] => {
  const configured = process.env.ORIGIN_WHITELIST?.split(",").map((o) => o.trim()).filter(Boolean);
  if (configured?.length) return configured;
  return process.env.NODE_ENV === "production" ? [] : ["http://localhost:5173", "http://localhost:5175"];
};

export const config = {
  env: process.env.NODE_ENV,
  port: Number(process.env.PORT),
  /** Porta dedicada do WebSocket nativo do terminal web (default: PORT + 1). */
  terminalPort: Number(process.env.TERMINAL_WS_PORT ?? Number(process.env.PORT) + 1),
  publicUrl: process.env.PUBLIC_URL ?? `http://localhost:${process.env.PORT}`,
  databaseProvider: process.env.DATABASE_PROVIDER as "postgresql" | "mysql" | "sqlite",
  auth: {
    accessTtl: process.env.ACCESS_TOKEN_TTL,
    refreshTtlMs: Number(process.env.REFRESH_TOKEN_TTL_MS),
    issuer: process.env.JWT_ISSUER,
    audience: process.env.JWT_AUDIENCE,
    cookieSecure: process.env.COOKIE_SECURE === "true",
  },
  originWhitelist: parseOrigins(),
  encryptionKey: process.env.ENCRYPTION_KEY ?? DEV_ENCRYPTION_KEY,
  s3: {
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION,
    bucket: process.env.S3_BUCKET,
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },
} as const;

/**
 * Falha alto no boot quando produção está com segredo de desenvolvimento.
 *
 * `ENCRYPTION_KEY` cifra kubeconfigs, tokens Git, credenciais SSH e senhas de
 * banco em repouso. Subir com o default público equivale a guardá-los em texto
 * puro — e o erro é silencioso, só aparece quando alguém já leu o banco.
 */
export function assertProductionSecrets(): void {
  if (config.env !== "production") return;

  const problems: string[] = [];
  if (config.encryptionKey === DEV_ENCRYPTION_KEY) {
    problems.push("ENCRYPTION_KEY está com o valor de exemplo — gere um novo: openssl rand -hex 32");
  }
  if (config.encryptionKey.length < 32) {
    problems.push("ENCRYPTION_KEY tem menos de 32 caracteres.");
  }
  if (!config.auth.cookieSecure && config.publicUrl.startsWith("https://")) {
    problems.push("COOKIE_SECURE=false com PUBLIC_URL https — o refresh token trafegaria sem a flag Secure.");
  }

  if (problems.length) {
    throw new Error(`[config] Configuração insegura para produção:\n  - ${problems.join("\n  - ")}`);
  }
}
