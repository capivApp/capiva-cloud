import { Injectable } from "@di/index";

/** Corpo do `/api/v1/query` (só o que a leitura instantânea usa): `value` é `[instante, "valor"]`. */
interface PrometheusQueryResponse {
  data?: { result?: { value?: [number, string] }[] };
}

/**
 * Adapter de métricas (Prometheus). O usuário nunca vê PromQL — a Service pede
 * grandezas simples (CPU/mem/req/latência/erros) e este adapter executa as
 * queries internas. Sem PROMETHEUS_URL, sintetiza valores plausíveis.
 */
@Injectable()
export class PrometheusAdapter {
  private readonly baseUrl = process.env.PROMETHEUS_URL;

  async instant(query: string): Promise<number | null> {
    if (!this.baseUrl) return null;
    try {
      const res = await fetch(`${this.baseUrl}/api/v1/query?query=${encodeURIComponent(query)}`);
      const data = (await res.json()) as PrometheusQueryResponse | null;
      const value = data?.data?.result?.[0]?.value?.[1];
      return value != null ? Number(value) : null;
    } catch {
      return null;
    }
  }
}
