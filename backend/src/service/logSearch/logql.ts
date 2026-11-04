import type { LogFiltros, LogRangeRequest, LogScope, LogSince } from "@interface/logs";
import { buildLevelPattern } from "@service/logSearch/logLevel.strategy";

/**
 * Builder de LogQL a partir dos filtros da tela. Função pura.
 *
 * O seletor `{namespace,app}` é SEMPRE o do servidor e vem primeiro; todo valor do
 * usuário entra como string literal escapada. Sem o escape, um `"}` na busca fecharia
 * o seletor e abriria outro, apontando para o namespace de outro tenant.
 */

export const POD_LABEL = "pod";
export const DEFAULT_LOG_LIMIT = 200;
const DEFAULT_SINCE: LogSince = "1h";

const SINCE_MS: Record<LogSince, number> = {
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "24h": 24 * 60 * 60_000,
};

const ESCAPES: Record<string, string> = {
  "\\": "\\\\",
  '"': '\\"',
  "\n": "\\n",
  "\r": "\\r",
  "\t": "\\t",
};

/** String literal do LogQL (aspas duplas, escape estilo Go). */
export const quoteLogQL = (value: string): string => `"${value.replace(/[\\"\n\r\t]/g, (c) => ESCAPES[c])}"`;

const matcher = (label: string, value: string) => `${label}=${quoteLogQL(value)}`;

export const buildLogSelector = (scope: LogScope, pod?: string): string => {
  const matchers = [matcher("namespace", scope.namespace), matcher("app", scope.app)];
  if (pod) matchers.push(matcher(POD_LABEL, pod));
  return `{${matchers.join(",")}}`;
};

type LineFilter = (filtros: LogFiltros) => string | undefined;

const textFilter = (operator: string, value?: string) => (value ? `${operator} ${quoteLogQL(value)}` : undefined);

/** Ordem dos estágios: os filtros literais (baratos) antes dos de regex. */
const LINE_FILTERS: LineFilter[] = [
  (f) => textFilter("|=", f.contains),
  (f) => textFilter("!=", f.notContains),
  (f) => textFilter("|~", f.regex),
  (f) => (f.levels?.length ? textFilter("|~", buildLevelPattern(f.levels)) : undefined),
];

export const buildLogQL = (scope: LogScope, filtros: LogFiltros): string =>
  [buildLogSelector(scope, filtros.pod), ...LINE_FILTERS.map((build) => build(filtros))].filter(Boolean).join(" ");

const toNs = (ms: number): string => String(BigInt(ms) * 1_000_000n);

/** Início/fim explícitos vencem o "últimos N"; sem nada, a última hora. */
export const resolveIntervalo = (filtros: Pick<LogFiltros, "since" | "start" | "end">, now: number) => {
  const end = filtros.end ? Date.parse(filtros.end) : now;
  if (filtros.start) return { start: toNs(Date.parse(filtros.start)), end: toNs(end) };
  return { start: toNs(now - SINCE_MS[filtros.since ?? DEFAULT_SINCE]), end: toNs(end) };
};

export const buildLokiRangeRequest = (scope: LogScope, filtros: LogFiltros, now: number): LogRangeRequest => ({
  query: buildLogQL(scope, filtros),
  ...resolveIntervalo(filtros, now),
  limit: filtros.limit ?? DEFAULT_LOG_LIMIT,
  direction: filtros.direction ?? "backward",
  filtros,
});
