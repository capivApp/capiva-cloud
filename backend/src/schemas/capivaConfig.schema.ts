import { z } from "zod";
import { profileKind, repoPathSchema, sourceKind } from "@schemas/application.schema";
import { HOST_RE } from "@functions/hostname";
import { HttpError } from "@functions/HttpError";

/**
 * Schema do `capiva.json` (infra como código da aplicação). Fonte única: valida o
 * arquivo no deploy E gera o JSON Schema servido em `/schemas/capiva.json` para o
 * autocompletar do editor. Objetos estritos: chave digitada errada (`prot`) é
 * erro, não um campo ignorado em silêncio.
 *
 * Sem `.transform()` de propósito: transforms não viram JSON Schema.
 */
const envKeySchema = z
  .string()
  .regex(
    /^[A-Za-z_][A-Za-z0-9_]*$/,
    "Chave inválida. Use letras, números e _, sem começar com número.",
  );

const commandSchema = z.string().trim().min(1, "Informe o comando.").max(1000);

const buildSchema = z.strictObject({
  type: sourceKind.optional().describe("Tipo de origem. Precisa ser o mesmo da aplicação."),
  dockerfile: repoPathSchema.optional().describe("Caminho do Dockerfile, relativo ao contexto."),
  context: repoPathSchema.optional().describe("Subpasta usada como contexto de build (monorepo)."),
  compose: repoPathSchema.optional().describe("Arquivo docker-compose."),
  buildCommand: commandSchema.optional().describe("Comando de build."),
  startCommand: commandSchema.optional().describe("Comando de start."),
  args: z.record(envKeySchema, z.string()).optional().describe("Build args (ARG do Dockerfile)."),
});

const autoscalingSchema = z
  .strictObject({
    min: z.number().int().min(1, "O mínimo de réplicas é 1."),
    max: z.number().int().min(1, "O máximo de réplicas é 1 ou mais."),
    metric: z.enum(["CPU", "MEMORY", "REQUESTS"]).default("CPU"),
    target: z.number().int().positive("Informe um alvo maior que zero."),
  })
  .refine((v) => v.max >= v.min, {
    message: "O máximo de réplicas não pode ser menor que o mínimo.",
    path: ["max"],
  });

const volumeSchema = z.strictObject({
  name: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "Use minúsculas, números e hífen."),
  mountPath: z.string().startsWith("/", "Use um caminho absoluto, ex.: /data."),
  sizeGi: z.number().int().min(1).default(1),
  accessMode: z.enum(["RWO", "RWX"]).default("RWO"),
});

export const capivaConfigSchema = z.strictObject({
  $schema: z.string().optional().describe("URL do JSON Schema (autocompletar no editor)."),
  build: buildSchema.optional(),
  port: z
    .number()
    .int()
    .min(1, "Porta deve estar entre 1 e 65535.")
    .max(65535, "Porta deve estar entre 1 e 65535.")
    .optional(),
  healthcheck: z
    .strictObject({ path: z.string().startsWith("/", "O caminho do health check começa com /.") })
    .optional(),
  profile: profileKind.optional().describe("Perfil de recurso."),
  replicas: z.number().int().min(0).max(100, "Use no máximo 100 réplicas.").optional(),
  autoscaling: autoscalingSchema.optional(),
  env: z
    .record(envKeySchema, z.string())
    .optional()
    .describe("Variáveis NÃO secretas. Segredos ficam na tela."),
  volumes: z.array(volumeSchema).optional(),
  domains: z
    .array(z.string().trim().regex(HOST_RE, "Domínio inválido, ex.: app.exemplo.com."))
    .optional(),
});

export type CapivaConfig = z.infer<typeof capivaConfigSchema>;

/** Arquivo recusado: o deploy para antes de tocar no que está no ar. */
export class CapivaConfigError extends HttpError {
  constructor(message: string) {
    super(message, 422, "CAPIVA_CONFIG_INVALID");
    this.name = "CapivaConfigError";
  }
}

const formatIssues = (error: z.ZodError): string =>
  error.issues
    .map((issue) => [issue.path.join("."), issue.message].filter(Boolean).join(": "))
    .join("; ");

const parseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    throw new CapivaConfigError("capiva.json não é um JSON válido.");
  }
};

/** Lê o conteúdo cru do arquivo. Inválido = `CapivaConfigError` com a mensagem do Zod. */
export function parseCapivaConfig(raw: string): CapivaConfig {
  const parsed = capivaConfigSchema.safeParse(parseJson(raw));
  if (parsed.success) return parsed.data;
  throw new CapivaConfigError(`capiva.json inválido: ${formatIssues(parsed.error)}`);
}

/** JSON Schema publicado (`/schemas/capiva.json`), gerado do mesmo schema Zod. */
export function buildCapivaJsonSchema(): Record<string, unknown> {
  return {
    ...(z.toJSONSchema(capivaConfigSchema, { io: "input" }) as Record<string, unknown>),
    title: "capiva.json",
    description:
      "Configuração da aplicação no Capiva Cloud. O que este arquivo declara vence a configuração da tela.",
  };
}
