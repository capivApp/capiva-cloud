/**
 * Estatísticas de requisição a partir do access log do Traefik: parse da linha,
 * taxa de 5xx e percentil de latência. Funções puras, sem Loki.
 */
import { describe, expect, it } from "bun:test";
import {
  computeErrorRate5xx,
  computePercentile,
  parseTraefikAccessLog,
} from "@functions/requestStats";

const entry = (status: number, durationMs = 10) => ({
  time: "",
  method: "GET",
  host: "a",
  path: "/",
  status,
  durationMs,
});

describe("parseTraefikAccessLog", () => {
  it("lê o JSON do Traefik mesmo com prefixo antes da chave", () => {
    const line = `2026-11-04T10:00:00Z {"RequestMethod":"POST","RequestHost":"app.x","RequestPath":"/a","DownstreamStatus":502,"Duration":250000000,"StartUTC":"t"}`;
    expect(parseTraefikAccessLog(line)).toEqual({
      time: "t",
      method: "POST",
      host: "app.x",
      path: "/a",
      status: 502,
      durationMs: 250,
    });
  });

  it("ignora linha que não é access log", () => {
    expect(parseTraefikAccessLog("INFO server listening")).toBeNull();
    expect(parseTraefikAccessLog(`{"level":"info"}`)).toBeNull();
    expect(parseTraefikAccessLog("{quebrado")).toBeNull();
  });
});

describe("computeErrorRate5xx", () => {
  it("devolve a porcentagem de respostas 5xx", () => {
    expect(computeErrorRate5xx([entry(200), entry(500), entry(503), entry(404)])).toBe(50);
  });

  it("sem requisições não há taxa", () => {
    expect(computeErrorRate5xx([])).toBeNull();
  });
});

describe("computePercentile", () => {
  it("p95 pelo método nearest-rank", () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(computePercentile(values, 0.95)).toBe(95);
  });

  it("um valor só é o próprio percentil", () => {
    expect(computePercentile([42], 0.95)).toBe(42);
  });

  it("não depende da ordem de entrada", () => {
    expect(computePercentile([300, 10, 20, 30], 0.5)).toBe(20);
  });

  it("sem valores não há percentil", () => {
    expect(computePercentile([], 0.95)).toBeNull();
  });
});
