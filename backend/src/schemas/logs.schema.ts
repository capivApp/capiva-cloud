import { z } from "zod";
import {
  LOG_DIRECTIONS,
  LOG_EXPORT_FORMATS,
  LOG_LEVELS,
  LOG_SINCE,
  type LogFiltros,
} from "@interface/logs";

/**
 * Filtros de logs vindos da QUERY STRING (consulta, download e live tail).
 *
 * Só existem aqui campos de filtro: namespace e app não são aceitos, e o `z.object`
 * descarta qualquer chave a mais. O escopo do tenant é sempre resolvido no servidor.
 */

export const LOG_QUERY_MAX_LIMIT = 5000;
export const LOG_DOWNLOAD_MAX_LINES = 50_000;
export const LOG_DOWNLOAD_DEFAULT_LINES = 10_000;
const MAX_RANGE_MS = 30 * 24 * 60 * 60_000;

const isValidRegex = (value: string): boolean => {
  try {
    new RegExp(value);
    return true;
  } catch {
    return false;
  }
};

/** Campo vazio na URL (`?q=`) é o mesmo que não filtrar. */
const dropEmpty = (raw: unknown): unknown =>
  raw && typeof raw === "object"
    ? Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== ""))
    : raw;

const splitList = (value: unknown): unknown =>
  typeof value === "string"
    ? value
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean)
    : value;

const texto = z.string().max(500, "Use até 500 caracteres.").optional();
const isoDate = z.iso
  .datetime({ offset: true, error: "Informe a data no formato ISO 8601." })
  .optional();
const limitMessage = `Use um limite entre 1 e ${LOG_QUERY_MAX_LIMIT} linhas.`;

const filtrosShape = {
  q: texto,
  exclude: texto,
  regex: texto.refine((v) => !v || isValidRegex(v), "Expressão regular inválida."),
  level: z.preprocess(
    splitList,
    z.array(z.enum(LOG_LEVELS, { error: "Nível de log inválido." })).optional(),
  ),
  pod: z
    .string()
    .max(253, "Informe um nome de pod válido.")
    .regex(/^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$/, "Informe um nome de pod válido.")
    .optional(),
  since: z.enum(LOG_SINCE, { error: "Escolha 15m, 1h ou 24h." }).optional(),
  start: isoDate,
  end: isoDate,
  limit: z.coerce
    .number({ error: limitMessage })
    .int(limitMessage)
    .min(1, limitMessage)
    .max(LOG_QUERY_MAX_LIMIT, limitMessage)
    .optional(),
  direction: z.enum(LOG_DIRECTIONS, { error: "Use backward ou forward." }).optional(),
};

type RawFiltros = z.infer<z.ZodObject<typeof filtrosShape>>;

const checkIntervalo = (raw: Pick<RawFiltros, "start" | "end">, ctx: z.RefinementCtx) => {
  if (!raw.start || !raw.end) return;
  const range = Date.parse(raw.end) - Date.parse(raw.start);
  if (range <= 0)
    ctx.addIssue({
      code: "custom",
      path: ["start"],
      message: "O início precisa ser anterior ao fim.",
    });
  if (range > MAX_RANGE_MS)
    ctx.addIssue({
      code: "custom",
      path: ["start"],
      message: "Escolha um intervalo de até 30 dias.",
    });
};

const toFiltros = (raw: RawFiltros): LogFiltros => ({
  contains: raw.q,
  notContains: raw.exclude,
  regex: raw.regex,
  levels: raw.level,
  pod: raw.pod,
  since: raw.since,
  start: raw.start,
  end: raw.end,
  limit: raw.limit,
  direction: raw.direction,
});

export const logFiltrosSchema = z.preprocess(
  dropEmpty,
  z.object(filtrosShape).superRefine(checkIntervalo).transform(toFiltros),
);

const maxLinesMessage = `Use um máximo entre 1 e ${LOG_DOWNLOAD_MAX_LINES} linhas.`;

export const logDownloadSchema = z.preprocess(
  dropEmpty,
  z
    .object({
      ...filtrosShape,
      format: z.enum(LOG_EXPORT_FORMATS, { error: "Escolha txt ou ndjson." }).default("txt"),
      maxLines: z.coerce
        .number({ error: maxLinesMessage })
        .int(maxLinesMessage)
        .min(1, maxLinesMessage)
        .max(LOG_DOWNLOAD_MAX_LINES, maxLinesMessage)
        .default(LOG_DOWNLOAD_DEFAULT_LINES),
    })
    .superRefine(checkIntervalo)
    .transform((raw) => ({ filtros: toFiltros(raw), format: raw.format, maxLines: raw.maxLines })),
);
