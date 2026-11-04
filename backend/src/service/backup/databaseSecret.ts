import { CONNECTION_META } from "@infra/kubernetes/databaseManifests";
import { decrypt } from "@functions/crypto";
import type { ManagedDatabase } from "@prisma-generated/client";

export type S3Creds = { endpoint: string; bucket: string; accessKeyId: string; secretAccessKey: string };

type DatabaseRef = Pick<ManagedDatabase, "name" | "kind" | "config">;

/** Nome do banco lógico (config.database ou derivado do nome do recurso). */
export function databaseNameOf(db: Pick<ManagedDatabase, "name" | "config">): string {
  const cfg = (db.config ?? {}) as { database?: string };
  return cfg.database ?? db.name.replace(/[^a-zA-Z0-9_]/g, "_");
}

/** Usuário do banco gravado na config (o mesmo da criação). */
export function databaseUserOf(db: Pick<ManagedDatabase, "config">): string {
  return ((db.config ?? {}) as { username?: string }).username ?? "capiva";
}

function safeDecrypt(value: string): string {
  try {
    return decrypt(value);
  } catch {
    return value;
  }
}

export const s3EnvOf = (s3: S3Creds) => ({
  S3_ENDPOINT: s3.endpoint,
  S3_BUCKET: s3.bucket,
  AWS_ACCESS_KEY_ID: s3.accessKeyId,
  AWS_SECRET_ACCESS_KEY: s3.secretAccessKey,
});

type ConnectionEnvBuilder = (input: { host: string; port: string; username: string; password: string; database: string }) => Record<string, string>;

const postgresEnv: ConnectionEnvBuilder = ({ host, port, username, password, database }) => {
  const baseUrl = `postgresql://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}`;
  return { DB_NAME: database, SRC_URL: `${baseUrl}/${database}`, BASE_URL: baseUrl, ADMIN_URL: `${baseUrl}/postgres` };
};

const hostEnv: ConnectionEnvBuilder = ({ host, username, password, database }) => ({
  DB_HOST: host,
  DB_USER: username,
  DB_PASS: password,
  DB_NAME: database,
});

/** Formato das variáveis de conexão por tipo de banco (o resto usa host/usuário/senha). */
const CONNECTION_ENV: Record<string, ConnectionEnvBuilder> = { POSTGRESQL: postgresEnv };

/**
 * Variáveis do Secret efêmero dos Jobs de backup e restore: credenciais do
 * banco (origem do dump ou destino do restore) + destino/origem S3.
 */
export function buildDatabaseSecretData(db: DatabaseRef, namespace: string, s3: S3Creds, extra: Record<string, string> = {}): Record<string, string> {
  const cfg = (db.config ?? {}) as { passwordCipher?: string };
  const meta = CONNECTION_META[db.kind] ?? CONNECTION_META.POSTGRESQL;
  const connection = (CONNECTION_ENV[db.kind] ?? hostEnv)({
    host: `${meta.host(db.name)}.${namespace}.svc.cluster.local`,
    port: String(meta.port),
    username: databaseUserOf(db),
    password: cfg.passwordCipher ? safeDecrypt(cfg.passwordCipher) : "",
    database: databaseNameOf(db),
  });
  return { ...s3EnvOf(s3), ...extra, ...connection };
}
