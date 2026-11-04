export interface RequestEntry {
  time: string;
  method: string;
  host: string;
  path: string;
  status: number;
  durationMs: number;
}

/** Seletor Loki do access log do Traefik, filtrado pelo host quando informado. */
export const buildTraefikSelector = (host?: string): string => {
  const hostFilter = host ? ` |~ \`${host}\`` : "";
  return `{namespace="kube-system",pod=~"traefik.*"}${hostFilter}`;
};

/** Parseia uma linha de access log JSON do Traefik numa entrada estruturada. */
export const parseTraefikAccessLog = (line: string): RequestEntry | null => {
  const start = line.indexOf("{");
  if (start < 0) return null;
  try {
    const log = JSON.parse(line.slice(start)) as Record<string, unknown>;
    if (!log.RequestMethod && !log.DownstreamStatus) return null;
    return {
      time: (log.StartUTC as string) ?? (log.time as string) ?? new Date().toISOString(),
      method: (log.RequestMethod as string) ?? "GET",
      host: (log.RequestHost as string) ?? "",
      path: (log.RequestPath as string) ?? "/",
      status: Number(log.DownstreamStatus ?? 0),
      durationMs: Math.round(Number(log.Duration ?? 0) / 1e6),
    };
  } catch {
    return null;
  }
};

/** Porcentagem (0 a 100) de respostas 5xx. Sem requisição não há taxa. */
export const computeErrorRate5xx = (entries: RequestEntry[]): number | null => {
  if (entries.length === 0) return null;
  const errors = entries.filter((e) => e.status >= 500).length;
  return (errors / entries.length) * 100;
};

/** Percentil pelo método nearest-rank (`quantile` entre 0 e 1). */
export const computePercentile = (values: number[], quantile: number): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil(quantile * sorted.length));
  return sorted[rank - 1];
};
