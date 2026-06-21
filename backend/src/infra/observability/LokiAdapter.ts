import { Injectable } from "@di/index";

export interface LogLine {
  ts: string;
  line: string;
}

/**
 * Adapter de logs (Loki). O usuário nunca vê LogQL — a Service traduz o nome da
 * aplicação num seletor de labels. Se LOKI_URL não estiver configurado, retorna
 * um conjunto simulado para a UI funcionar sem a stack de observabilidade.
 */
@Injectable()
export class LokiAdapter {
  private readonly baseUrl = process.env.LOKI_URL;

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

  private simulated(): LogLine[] {
    const now = new Date();
    return [
      "INFO  server listening on :3000",
      "INFO  GET /health 200 2ms",
      "WARN  slow query 812ms",
      "INFO  POST /orders 201 41ms",
    ].map((line, i) => ({ ts: String((now.getTime() - i * 1000) * 1e6), line: `${now.toISOString()}  ${line}` }));
  }
}
