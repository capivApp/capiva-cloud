/**
 * Strategies de métrica dos alertas: Prometheus primeiro, metrics-server como
 * reserva para CPU/memória, access log do Traefik (Loki) para 5xx e latência.
 * Adapters mockados: sem cluster, sem Prometheus, sem Loki.
 */
import { describe, expect, it, mock } from "bun:test";
import {
  createAlertMetricStrategies,
  type AlertMetricSources,
} from "@infra/alerts/alertMetric.strategy";

const target = { app: "api", namespace: "prod", kubeconfig: "kc", host: "api.exemplo.com" };

const accessLog = (status: number, durationMs: number) =>
  `{"RequestMethod":"GET","RequestHost":"api.exemplo.com","RequestPath":"/","DownstreamStatus":${status},"Duration":${durationMs * 1e6}}`;

const makeSources = (over: Partial<AlertMetricSources> = {}): AlertMetricSources => ({
  prometheus: { instant: mock(async () => null) },
  loki: { queryWindow: mock(async () => null) },
  kubernetes: { topPods: mock(async () => []) },
  ...over,
});

describe("CPU", () => {
  it("usa o Prometheus com a janela da regra", async () => {
    const instant = mock(async (_query: string) => 72.5);
    const strategies = createAlertMetricStrategies(makeSources({ prometheus: { instant } }));
    expect(await strategies.CPU.measure(target, 10)).toBe(72.5);
    expect(String(instant.mock.calls[0]?.[0])).toContain("[10m]");
  });

  it("sem Prometheus, soma os pods da aplicação no metrics-server (1000m = 100%)", async () => {
    const topPods = mock(async () => [
      { name: "api-7d9-abc", namespace: "prod", node: "n1", cpuMillicores: 300, memoryMib: 100 },
      { name: "api-7d9-def", namespace: "prod", node: "n1", cpuMillicores: 200, memoryMib: 50 },
      { name: "worker-1", namespace: "prod", node: "n1", cpuMillicores: 900, memoryMib: 500 },
    ]);
    const strategies = createAlertMetricStrategies(makeSources({ kubernetes: { topPods } }));
    expect(await strategies.CPU.measure(target, 5)).toBe(50);
    expect(await strategies.MEMORY.measure(target, 5)).toBe(150);
  });

  it("sem nenhuma fonte, devolve null", async () => {
    const strategies = createAlertMetricStrategies(makeSources());
    expect(await strategies.CPU.measure(target, 5)).toBeNull();
    expect(await strategies.MEMORY.measure(target, 5)).toBeNull();
  });
});

describe("5xx e latência", () => {
  const lines = [
    accessLog(200, 10),
    accessLog(500, 20),
    accessLog(200, 30),
    accessLog(502, 400),
  ].map((line) => ({ ts: "0", line }));

  it("calcula a taxa de 5xx a partir do access log da janela", async () => {
    const queryWindow = mock(async (_selector: string, _windowMs: number) => lines);
    const strategies = createAlertMetricStrategies(makeSources({ loki: { queryWindow } }));
    expect(await strategies.ERROR_RATE_5XX.measure(target, 15)).toBe(50);
    expect(queryWindow.mock.calls[0]?.[1]).toBe(15 * 60_000);
  });

  it("calcula o p95 da latência", async () => {
    const strategies = createAlertMetricStrategies(
      makeSources({ loki: { queryWindow: mock(async () => lines) } }),
    );
    expect(await strategies.LATENCY_P95.measure(target, 5)).toBe(400);
  });

  it("sem domínio não consulta o Loki (o seletor pegaria o tráfego de todo o cluster)", async () => {
    const queryWindow = mock(async (_selector: string, _windowMs: number) => lines);
    const strategies = createAlertMetricStrategies(makeSources({ loki: { queryWindow } }));
    expect(await strategies.ERROR_RATE_5XX.measure({ ...target, host: undefined }, 5)).toBeNull();
    expect(queryWindow).not.toHaveBeenCalled();
  });

  it("sem Loki devolve null", async () => {
    const strategies = createAlertMetricStrategies(makeSources());
    expect(await strategies.ERROR_RATE_5XX.measure(target, 5)).toBeNull();
    expect(await strategies.LATENCY_P95.measure(target, 5)).toBeNull();
  });
});
