import { LOG_LEVELS, type LogLevel } from "@interface/logs";

/**
 * Nível de log por formato de linha. Cada formato sabe escrever o padrão que reconhece
 * um nível; a busca no Loki (`|~`) e a detecção em memória usam o MESMO padrão, então
 * o que a tela marca como erro é exatamente o que o filtro de erro devolve.
 *
 * Os padrões são RE2 e JS ao mesmo tempo: nada de lookaround nem backreference.
 */
interface LevelVocabulary {
  words: string[];
  /** Níveis numéricos do pino/bunyan. */
  numbers: number[];
}

const VOCABULARIO: Record<LogLevel, LevelVocabulary> = {
  error: { words: ["error", "err", "fatal", "critical", "panic"], numbers: [50, 60] },
  warn: { words: ["warn", "warning"], numbers: [40] },
  info: { words: ["info", "notice"], numbers: [30] },
  debug: { words: ["debug", "trace"], numbers: [20, 10] },
};

export interface LogFormatStrategy {
  readonly name: string;
  pattern(level: LogLevel): string;
}

const LEVEL_KEYS = "(?i:level|lvl|severity)";
const alternatives = (values: Array<string | number>) => values.join("|");

/** `{"level":"error"}`, `{"severity":"WARN"}` e o numérico do pino `{"level":50}`. */
const jsonFormat: LogFormatStrategy = {
  name: "json",
  pattern: (level) => {
    const { words, numbers } = VOCABULARIO[level];
    return `"${LEVEL_KEYS}"\\s*:\\s*(?:"(?i:${alternatives(words)})"|(?:${alternatives(numbers)})\\b)`;
  },
};

/** `level=error`, `lvl="warning"`. */
const logfmtFormat: LogFormatStrategy = {
  name: "logfmt",
  pattern: (level) => `\\b${LEVEL_KEYS}="?(?i:${alternatives(VOCABULARIO[level].words)})\\b`,
};

/**
 * Texto livre: a palavra em MAIÚSCULA (`ERROR`, `[WARN]`) ou entre colchetes em
 * minúscula (`[error]` do nginx). Minúscula solta fica de fora de propósito: "no errors"
 * numa mensagem não é log de erro.
 */
const textFormat: LogFormatStrategy = {
  name: "text",
  pattern: (level) => {
    const { words } = VOCABULARIO[level];
    return `\\b(?:${alternatives(words.map((w) => w.toUpperCase()))})\\b|\\[(?i:${alternatives(words)})\\]`;
  },
};

export const LOG_FORMATS: readonly LogFormatStrategy[] = [jsonFormat, logfmtFormat, textFormat];

const patternOf = (level: LogLevel) => LOG_FORMATS.map((format) => format.pattern(level)).join("|");

/** Um único regex que casa qualquer um dos níveis pedidos, em qualquer formato. */
export const buildLevelPattern = (levels: readonly LogLevel[]): string => `(?:${levels.map(patternOf).join("|")})`;

const DETECTORES: Array<[LogLevel, RegExp]> = LOG_LEVELS.map((level) => [level, new RegExp(patternOf(level))]);

/** Primeiro nível que casa, na ordem de gravidade. `null` quando a linha não diz. */
export const detectLogLevel = (line: string): LogLevel | null =>
  DETECTORES.find(([, regex]) => regex.test(line))?.[0] ?? null;
