import { Injectable } from "@di/index";
import type { LogLine, LogRangeRequest, LogSource } from "@interface/logs";
import { createLogSource, SimulatedLogSource } from "@infra/observability/logSources";

export type { LogLine } from "@interface/logs";

/**
 * Adapter de logs (Loki). O usuário nunca vê LogQL — a Service traduz o nome da
 * aplicação num seletor de labels. Se LOKI_URL não estiver configurado, retorna
 * um conjunto simulado para a UI funcionar sem a stack de observabilidade.
 */
@Injectable()
export class LokiAdapter implements LogSource {
  private readonly baseUrl = process.env.LOKI_URL;
  private readonly source = createLogSource(this.baseUrl);

  /** Busca com filtros (ver `@service/logSearch/logql`). Sem Loki, a fonte simulada filtrada. */
  range(request: LogRangeRequest): Promise<LogLine[]> {
    return this.source.range(request);
  }

  labelValues(label: string, request: LogRangeRequest): Promise<string[]> {
    return this.source.labelValues(label, request);
  }

  async queryBySelector(selector: string, limit = 200): Promise<LogLine[]> {
    if (!this.baseUrl) return this.simulated();
    const end = Date.now() * 1e6;
    const start = (Date.now() - 30 * 60 * 1000) * 1e6;
    const url = `${this.baseUrl}/loki/api/v1/query_range?query=${encodeURIComponent(selector)}&limit=${limit}&start=${start}&end=${end}`;
    try {
      const res = await fetch(url);
      const data = (await res.json()) as any;
      const streams = data?.data?.result ?? [];
      return streams.flatMap((s: any) => (s.values ?? []).map((v: [string, string]) => ({ ts: v[0], line: v[1] }))).slice(-limit);
    } catch {
      return this.simulated();
    }
  }

  /**
   * Linhas reais da janela `[agora - windowMs, agora]`. Diferente de
   * `queryBySelector`, NUNCA simula: devolve `null` sem Loki ou em erro, porque
   * quem avalia alerta não pode disparar (nem resolver) com dado inventado.
   */
  async queryWindow(selector: string, windowMs: number, limit = 5000): Promise<LogLine[] | null> {
    if (!this.baseUrl) return null;
    const end = Date.now() * 1e6;
    const start = (Date.now() - windowMs) * 1e6;
    const url = `${this.baseUrl}/loki/api/v1/query_range?query=${encodeURIComponent(selector)}&limit=${limit}&start=${start}&end=${end}`;
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = (await res.json()) as any;
      const streams = data?.data?.result ?? [];
      return streams.flatMap((s: any) => (s.values ?? []).map((v: [string, string]) => ({ ts: v[0], line: v[1] })));
    } catch {
      return null;
    }
  }

  private simulated(): LogLine[] {
    return new SimulatedLogSource().lines();
  }
}
