import { z } from "zod";

export const sourceKind = z.enum([
  "DOCKER_IMAGE",
  "GITHUB",
  "GITLAB",
  "GITEA",
  "DOCKER_COMPOSE",
  "NIXPACKS",
  "RAILPACK",
  "BUILDPACKS",
  "STATIC",
]);

export const profileKind = z.enum(["NANO", "SMALL", "MEDIUM", "LARGE", "XLARGE", "CUSTOM"]);
export const rolloutStrategy = z.enum(["ROLLING", "BLUE_GREEN", "CANARY"]);

const keyValue = z.object({ key: z.string().min(1), value: z.string().default("") });

export const volumeSchema = z.object({
  name: z.string().min(1).regex(/^[a-z0-9-]+$/, "Use minúsculas, números e hífen"),
  mountPath: z.string().min(1),
  sizeGi: z.number().int().min(1).default(1),
  accessMode: z.enum(["RWO", "RWX"]).default("RWO"),
});

export const createApplicationSchema = z.object({
  projectId: z.string(),
  environmentId: z.string(),
  name: z.string().min(1),
  source: sourceKind,
  sourceConfig: z.record(z.string(), z.unknown()).default({}),
  profile: profileKind.default("SMALL"),
  rolloutStrategy: rolloutStrategy.default("ROLLING"),
  port: z.number().int().positive().default(3000),
  /** Variáveis de RUNTIME da aplicação (injetadas no container). */
  env: z.array(keyValue).default([]),
  /** Variáveis de BUILD (viram build args / ARG no Dockerfile). */
  buildArgs: z.array(keyValue).default([]),
  /** Tags para filtros/relatórios. */
  tags: z.array(z.string()).default([]),
  /** Volumes persistentes. */
  volumes: z.array(volumeSchema).default([]),
});

export const updateTagsSchema = z.object({ tags: z.array(z.string()) });

export const updateStrategySchema = z.object({
  strategy: rolloutStrategy,
  config: z
    .object({
      initialTraffic: z.number().min(1).max(100).optional(),
      increment: z.number().min(1).max(100).optional(),
      intervalMinutes: z.number().min(1).optional(),
      autoRollback: z.boolean().optional(),
    })
    .default({}),
});

export type CreateApplicationDTO = z.infer<typeof createApplicationSchema>;
export type UpdateStrategyDTO = z.infer<typeof updateStrategySchema>;
