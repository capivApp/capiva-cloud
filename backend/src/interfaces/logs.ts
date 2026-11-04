/** Contratos da busca de logs (Loki ou fonte simulada). */

export const LOG_LEVELS = ["error", "warn", "info", "debug"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export const LOG_SINCE = ["15m", "1h", "24h"] as const;
export type LogSince = (typeof LOG_SINCE)[number];

export const LOG_DIRECTIONS = ["backward", "forward"] as const;
export type LogDirection = (typeof LOG_DIRECTIONS)[number];

export const LOG_EXPORT_FORMATS = ["txt", "ndjson"] as const;
export type LogExportFormat = (typeof LOG_EXPORT_FORMATS)[number];

export interface LogLine {
  /** Instante em nanossegundos desde a época (string, como o Loki devolve). */
  ts: string;
  line: string;
  pod?: string;
  level?: LogLevel;
}

/** Escopo imposto pelo servidor. NUNCA vem do usuário. */
export interface LogScope {
  namespace: string;
  app: string;
}

/** Filtros que o usuário pode pedir. Nenhum deles mexe no namespace/app. */
export interface LogFiltros {
  contains?: string;
  notContains?: string;
  regex?: string;
  levels?: LogLevel[];
  pod?: string;
  since?: LogSince;
  start?: string;
  end?: string;
  limit?: number;
  direction?: LogDirection;
}

/** Pedido pronto para o `query_range` do Loki. `start`/`end` em ns; `end` exclusivo. */
export interface LogRangeRequest {
  query: string;
  start: string;
  end: string;
  limit: number;
  direction: LogDirection;
  /** Filtros originais: a fonte simulada os aplica em memória. */
  filtros: LogFiltros;
}

export interface LogSource {
  range(request: LogRangeRequest): Promise<LogLine[]>;
  labelValues(label: string, request: LogRangeRequest): Promise<string[]>;
}
