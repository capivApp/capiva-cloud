import type { LogLine, LogRangeRequest, LogSource } from "@interface/logs";
import { HttpError } from "@functions/HttpError";
import { buildLogPredicate } from "@service/logSearch/logPredicate";

interface LokiStream {
  stream?: Record<string, string>;
  values?: Array<[string, string]>;
}

/** Corpo do `query_range` do Loki (só o que as leituras usam). */
export interface LokiQueryResponse {
  data?: { result?: LokiStream[] };
}

/**
 * Linhas de exemplo para a UI funcionar sem a stack de observabilidade. São as
 * mesmas de antes da busca existir; os filtros valem sobre elas.
 */
export class SimulatedLogSource implements LogSource {
  lines(): LogLine[] {
    const now = new Date();
    return [
      "INFO  server listening on :3000",
      "INFO  GET /health 200 2ms",
      "WARN  slow query 812ms",
      "INFO  POST /orders 201 41ms",
    ].map((line, i) => ({
      ts: String((now.getTime() - i * 1000) * 1e6),
      line: `${now.toISOString()}  ${line}`,
    }));
  }

  async range(request: LogRangeRequest): Promise<LogLine[]> {
    return this.lines().filter(buildLogPredicate(request.filtros)).slice(0, request.limit);
  }

  async labelValues(_label: string, _request: LogRangeRequest): Promise<string[]> {
    return [];
  }
}

/**
 * Loki via HTTP. Falha de rede cai na fonte simulada (o comportamento de antes);
 * 4xx é filtro que o Loki recusou (regex RE2 inválida, por exemplo) e vira 400.
 */
export class LokiLogSource implements LogSource {
  constructor(
    private readonly baseUrl: string,
    private readonly fallback: LogSource = new SimulatedLogSource(),
  ) {}

  async range(request: LogRangeRequest): Promise<LogLine[]> {
    const params = new URLSearchParams({
      query: request.query,
      limit: String(request.limit),
      start: request.start,
      end: request.end,
      direction: request.direction,
    });
    const res = await fetch(`${this.baseUrl}/loki/api/v1/query_range?${params.toString()}`).catch(
      () => null,
    );
    if (!res) return this.fallback.range(request);
    if (res.status >= 400 && res.status < 500) {
      throw HttpError.badRequest(
        "Não foi possível aplicar o filtro. Revise a busca e a expressão regular.",
        "LOG_FILTER",
      );
    }
    const data = (await res.json().catch(() => null)) as LokiQueryResponse | null;
    if (!res.ok || !data) return this.fallback.range(request);
    return (data.data?.result ?? []).flatMap((s) =>
      (s.values ?? []).map(([ts, line]) => ({ ts, line, pod: s.stream?.pod })),
    );
  }

  async labelValues(label: string, request: LogRangeRequest): Promise<string[]> {
    const params = new URLSearchParams({
      query: request.query,
      start: request.start,
      end: request.end,
    });
    const res = await fetch(
      `${this.baseUrl}/loki/api/v1/label/${encodeURIComponent(label)}/values?${params.toString()}`,
    ).catch(() => null);
    if (!res?.ok) return [];
    const data = (await res.json().catch(() => null)) as { data?: string[] } | null;
    return data?.data ?? [];
  }
}

/** Factory: com `LOKI_URL`, Loki; sem, a fonte simulada. */
export const createLogSource = (baseUrl?: string): LogSource =>
  baseUrl ? new LokiLogSource(baseUrl) : new SimulatedLogSource();
