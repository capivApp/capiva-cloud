import { z } from "zod";
import { assertValidCron } from "@infra/scheduler/cron";

/** Valida expressão cron de 5 campos (usada nos backups agendados de banco). */
const cronExpression = z.string().refine(
  (v) => {
    try {
      assertValidCron(v);
      return true;
    } catch {
      return false;
    }
  },
  { message: "Expressão cron inválida (use 5 campos, ex.: '0 3 * * *')" },
);

export const createEnvironmentSchema = z.object({
  name: z.string().min(1),
  kind: z.enum(["DEVELOPMENT", "STAGING", "PRODUCTION"]).default("DEVELOPMENT"),
  clusterId: z.string().optional(),
});

export const createClusterSchema = z.object({
  name: z.string().min(1),
  region: z.string().optional(),
  apiUrl: z.string().url("URL do API server inválida"),
  token: z.string().min(1, "Token obrigatório"),
  caCert: z.string().optional(),
});

export const createGitConnectionSchema = z.object({
  provider: z.enum(["GITHUB", "GITLAB", "GITEA"]),
  accessToken: z.string().min(1),
  accountLogin: z.string().optional(),
  baseUrl: z.string().url().optional(),
});

export const createDatabaseSchema = z.object({
  projectId: z.string(),
  environmentId: z.string(),
  name: z.string().min(1),
  kind: z.enum(["POSTGRESQL", "MYSQL", "REDIS", "RABBITMQ", "KAFKA", "MINIO", "ELASTICSEARCH", "CLICKHOUSE"]),
  size: z.enum(["SMALL", "MEDIUM", "LARGE"]).default("SMALL"),
  highAvailability: z.boolean().default(false),
  username: z.string().optional(),
  password: z.string().optional(),
  database: z.string().optional(),
  backupEnabled: z.boolean().default(true),
  backupSchedule: cronExpression.optional(),
  retentionDays: z.number().int().min(1).optional(),
});

export const updateDatabaseSchema = z.object({
  backupEnabled: z.boolean().optional(),
  backupSchedule: cronExpression.optional(),
  retentionDays: z.number().int().min(1).optional(),
  password: z.string().optional(),
});

export type CreateEnvironmentDTO = z.infer<typeof createEnvironmentSchema>;
export type CreateClusterDTO = z.infer<typeof createClusterSchema>;
export type CreateGitConnectionDTO = z.infer<typeof createGitConnectionSchema>;
export type CreateDatabaseDTO = z.infer<typeof createDatabaseSchema>;
export type UpdateDatabaseDTO = z.infer<typeof updateDatabaseSchema>;
