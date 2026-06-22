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
  /** TLS do domínio: lets_encrypt (cert-manager) | uploaded (cert da org) | none. */
  tlsMode: z.enum(["LETS_ENCRYPT", "UPLOADED", "NONE"]).default("LETS_ENCRYPT"),
  tlsCertificateId: z.string().optional(),
  /** Registry privado opcional (gera imagePullSecret). */
  registryId: z.string().optional(),
});

/** Variável de ambiente no editor pós-criação (chave estilo shell). */
export const envVarItemSchema = z.object({
  key: z
    .string()
    .min(1)
    .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "Chave inválida (use letras, números e _, sem iniciar com número)"),
  value: z.string().default(""),
  secret: z.boolean().default(false),
});

export const replaceEnvVarsSchema = z.object({ vars: z.array(envVarItemSchema) });

export const addDomainSchema = z.object({
  host: z.string().min(1),
  tlsMode: z.enum(["lets_encrypt", "uploaded", "none"]).default("lets_encrypt"),
  tlsCertificateId: z.string().optional(),
});

export const setScalingSchema = z.object({
  minReplicas: z.number().int().min(1),
  maxReplicas: z.number().int().min(1),
  metric: z.enum(["CPU", "MEMORY", "REQUESTS"]).default("CPU"),
  target: z.number().int().positive(),
});

export const scaleReplicasSchema = z.object({ replicas: z.number().int().min(0).max(100) });

export const updateApplicationSchema = z
  .object({
    name: z.string().min(1).regex(/^[a-z0-9-]+$/, "Use minúsculas, números e hífen").optional(),
    profile: profileKind.optional(),
    customResources: z.record(z.string(), z.unknown()).optional(),
    port: z.number().int().positive().optional(),
    /** Branch/repo do build → mesclado em sourceConfig.branch. */
    branch: z.string().optional(),
    /** Imagem (origem Docker) → sourceConfig.image. */
    image: z.string().optional(),
    /** Caminho do health check (readiness) → sourceConfig.healthPath. */
    healthPath: z.string().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nada para atualizar." });

export const updateTagsSchema = z.object({ tags: z.array(z.string()) });

export const updateTlsSchema = z.object({
  tlsMode: z.enum(["LETS_ENCRYPT", "UPLOADED", "NONE"]),
  tlsCertificateId: z.string().optional(),
});

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
