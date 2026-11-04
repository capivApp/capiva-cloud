/**
 * Filtros da tela de logs. A URL é a fonte da verdade (o link compartilhado abre a
 * mesma busca); estas funções só convertem URL ↔ estado ↔ query string da API.
 */

export const LOG_LEVEL_OPTIONS = [
  { value: "error", label: "Erro" },
  { value: "warn", label: "Aviso" },
  { value: "info", label: "Info" },
  { value: "debug", label: "Debug" },
] as const;
export type LogLevel = (typeof LOG_LEVEL_OPTIONS)[number]["value"];

export const LOG_INTERVAL_OPTIONS = [
  { value: "live", label: "Ao vivo" },
  { value: "15m", label: "Últimos 15 min" },
  { value: "1h", label: "Última 1 h" },
  { value: "24h", label: "Últimas 24 h" },
  { value: "custom", label: "Personalizado" },
] as const;
export type LogInterval = (typeof LOG_INTERVAL_OPTIONS)[number]["value"];

export type LogQueryMode = "live" | "search" | "download";

export interface LogFilterState {
  q: string;
  exclude: string;
  regex: string;
  levels: LogLevel[];
  pod: string;
  interval: LogInterval;
  start: string;
  end: string;
}

const LEVELS = new Set<string>(LOG_LEVEL_OPTIONS.map((o) => o.value));
const INTERVALS = new Set<string>(LOG_INTERVAL_OPTIONS.map((o) => o.value));

const isLogLevel = (value: string): value is LogLevel => LEVELS.has(value);
const isLogInterval = (value: string): value is LogInterval => INTERVALS.has(value);

export const isValidRegex = (value: string): boolean => {
  try {
    new RegExp(value);
    return true;
  } catch {
    return false;
  }
};

export const readLogFilters = (params: URLSearchParams): LogFilterState => {
  const since = params.get("since") ?? "";
  return {
    q: params.get("q") ?? "",
    exclude: params.get("exclude") ?? "",
    regex: params.get("regex") ?? "",
    levels: (params.get("level") ?? "").split(",").filter(isLogLevel),
    pod: params.get("pod") ?? "",
    interval: isLogInterval(since) ? since : "live",
    start: params.get("start") ?? "",
    end: params.get("end") ?? "",
  };
};

/** "Ao vivo" é o padrão e não ocupa a URL; `undefined` deixa o parâmetro como está. */
const sinceForUrl = (interval?: LogInterval): string | undefined => {
  if (interval === undefined) return undefined;
  return interval === "live" ? "" : interval;
};

const toUrlEntries = (state: Partial<LogFilterState>): Array<[string, string | undefined]> => [
  ["q", state.q],
  ["exclude", state.exclude],
  ["regex", state.regex],
  ["level", state.levels?.join(",")],
  ["pod", state.pod],
  ["since", sinceForUrl(state.interval)],
  ["start", state.start],
  ["end", state.end],
];

export const writeLogFilters = (params: URLSearchParams, patch: Partial<LogFilterState>): URLSearchParams => {
  const next = new URLSearchParams(params);
  for (const [key, value] of toUrlEntries(patch)) {
    if (value === undefined) continue;
    if (value) next.set(key, value);
    else next.delete(key);
  }
  return next;
};

/** Pares do intervalo por modo. Ao vivo não manda intervalo; busca e download sem intervalo usam a última hora. */
const INTERVAL_ENTRIES: Record<LogQueryMode, (state: LogFilterState) => Array<[string, string]>> = {
  live: () => [],
  search: (state) => intervalEntries(state),
  download: (state) => intervalEntries(state),
};

const intervalEntries = (state: LogFilterState): Array<[string, string]> => {
  if (state.interval === "live") return [["since", "1h"]];
  if (state.interval !== "custom") return [["since", state.interval]];
  return [
    ["start", state.start],
    ["end", state.end],
  ];
};

export const buildLogQuery = (state: LogFilterState, mode: LogQueryMode): string => {
  const entries: Array<[string, string]> = [
    ["q", state.q],
    ["exclude", state.exclude],
    ["regex", isValidRegex(state.regex) ? state.regex : ""],
    ["level", state.levels.join(",")],
    ["pod", state.pod],
    ...INTERVAL_ENTRIES[mode](state),
  ];
  return new URLSearchParams(entries.filter(([, value]) => Boolean(value))).toString();
};

export interface HighlightPart {
  text: string;
  match: boolean;
}

/** Partes da linha com o termo buscado marcado. Literal e sensível a maiúsculas, como o `|=` do Loki. */
export const splitHighlight = (line: string, term: string): HighlightPart[] => {
  if (!term) return [{ text: line, match: false }];
  return line
    .split(term)
    .flatMap((text, i) => (i === 0 ? [{ text, match: false }] : [{ text: term, match: true }, { text, match: false }]))
    .filter((part) => part.text !== "");
};
