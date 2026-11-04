/**
 * Busca de logs: orquestração (ordem, nível detectado, paginação do download,
 * formatos de exportação) e a fonte simulada usada sem Loki. Fonte de logs falsa,
 * sem rede e sem banco.
 */
import { describe, expect, it } from "bun:test";
import { LogSearch } from "@service/logSearch/LogSearch";
import { createLogExportFormat } from "@service/logSearch/logExport.strategy";
import { buildLogPredicate } from "@service/logSearch/logPredicate";
import { SimulatedLogSource } from "@infra/observability/logSources";
import type { LogLine, LogRangeRequest, LogSource } from "@interface/logs";

const scope = { namespace: "team-a", app: "api" };
const NOW = Date.parse("2026-11-04T12:00:00.000Z");

/** Fonte falsa: devolve as linhas da janela pedida, respeitando limite e direção. */
function fakeSource(all: LogLine[]): LogSource & { calls: LogRangeRequest[] } {
  const calls: LogRangeRequest[] = [];
  return {
    calls,
    async range(req) {
      calls.push(req);
      const inWindow = all.filter((l) => BigInt(l.ts) >= BigInt(req.start) && BigInt(l.ts) < BigInt(req.end));
      const ordered = req.direction === "forward" ? inWindow : [...inWindow].reverse();
      return ordered.slice(0, req.limit);
    },
    async labelValues() {
      return ["api-2", "api-1"];
    },
  };
}

const at = (secondsAgo: number, line: string, pod = "api-1"): LogLine => ({
  ts: String(BigInt(NOW - secondsAgo * 1000) * 1_000_000n),
  line,
  pod,
});

describe("LogSearch.search", () => {
  it("devolve em ordem cronológica e com o nível detectado", async () => {
    const source = fakeSource([at(30, "INFO a"), at(20, "ERROR b"), at(10, "c")]);
    const result = await new LogSearch(source, () => NOW).search(scope, {});
    expect(result.lines.map((l) => l.line)).toEqual(["INFO a", "ERROR b", "c"]);
    expect(result.lines.map((l) => l.level)).toEqual(["info", "error", undefined]);
  });

  it("manda para a fonte a query montada pelo servidor", async () => {
    const source = fakeSource([]);
    await new LogSearch(source, () => NOW).search(scope, { contains: "x", pod: "api-1" });
    expect(source.calls[0]?.query).toBe('{namespace="team-a",app="api",pod="api-1"} |= "x"');
  });

  it("lista os pods em ordem alfabética", async () => {
    const pods = await new LogSearch(fakeSource([]), () => NOW).pods(scope, {});
    expect(pods).toEqual(["api-1", "api-2"]);
  });
});

describe("LogSearch.export", () => {
  const lines = Array.from({ length: 25 }, (_, i) => at(100 - i, `linha ${i}`));

  const collect = async (gen: AsyncGenerator<LogLine[]>) => {
    const out: LogLine[] = [];
    for await (const page of gen) out.push(...page);
    return out;
  };

  it("pagina para trás (mais recente primeiro) até o máximo de linhas", async () => {
    const source = fakeSource(lines);
    const out = await collect(new LogSearch(source, () => NOW, 10).export(scope, { since: "1h" }, 23));
    expect(out).toHaveLength(23);
    expect(out[0]?.line).toBe("linha 24");
    expect(out[22]?.line).toBe("linha 2");
    expect(source.calls.map((c) => c.limit)).toEqual([10, 10, 3]);
  });

  it("pagina para frente (mais antiga primeiro) sem repetir linha", async () => {
    const source = fakeSource(lines);
    const out = await collect(new LogSearch(source, () => NOW, 10).export(scope, { since: "1h", direction: "forward" }, 1000));
    expect(out.map((l) => l.line)).toEqual(lines.map((l) => l.line));
  });

  it("para quando a fonte não tem mais linhas", async () => {
    const source = fakeSource(lines.slice(0, 4));
    const out = await collect(new LogSearch(source, () => NOW, 10).export(scope, {}, 1000));
    expect(out).toHaveLength(4);
    expect(source.calls).toHaveLength(1);
  });
});

describe("formatos de exportação", () => {
  const line: LogLine = { ts: String(BigInt(NOW) * 1_000_000n), line: 'ERROR deu "ruim"', pod: "api-1", level: "error" };

  it("txt: data ISO, pod e a linha crua", () => {
    const txt = createLogExportFormat("txt");
    expect(txt.contentType).toBe("text/plain; charset=utf-8");
    expect(txt.extension).toBe("txt");
    expect(txt.serialize(line)).toBe('2026-11-04T12:00:00.000Z [api-1] ERROR deu "ruim"\n');
    expect(txt.serialize({ ts: line.ts, line: "sem pod" })).toBe("2026-11-04T12:00:00.000Z sem pod\n");
  });

  it("ndjson: um objeto JSON por linha", () => {
    const ndjson = createLogExportFormat("ndjson");
    expect(ndjson.contentType).toBe("application/x-ndjson; charset=utf-8");
    expect(ndjson.extension).toBe("ndjson");
    const out = ndjson.serialize(line);
    expect(out.endsWith("\n")).toBe(true);
    expect(JSON.parse(out)).toEqual({ time: "2026-11-04T12:00:00.000Z", ts: line.ts, pod: "api-1", level: "error", line: 'ERROR deu "ruim"' });
  });
});

describe("buildLogPredicate (filtro em memória, usado sem Loki)", () => {
  const linhas = ["INFO GET /health 200", "WARN slow query 812ms", "ERROR timeout ao chamar /orders", "INFO POST /orders 201"];
  const filtra = (filtros: Parameters<typeof buildLogPredicate>[0]) => linhas.filter((l) => buildLogPredicate(filtros)({ ts: "0", line: l }));

  it("sem filtro, passa tudo", () => {
    expect(filtra({})).toEqual(linhas);
  });

  it("aplica contém, não contém, regex e nível como o LogQL", () => {
    expect(filtra({ contains: "/orders" })).toEqual([linhas[2]!, linhas[3]!]);
    expect(filtra({ notContains: "/health" })).toEqual(linhas.slice(1));
    expect(filtra({ regex: "\\d{3}ms" })).toEqual([linhas[1]!]);
    expect(filtra({ levels: ["error", "warn"] })).toEqual([linhas[1]!, linhas[2]!]);
    expect(filtra({ contains: "/orders", levels: ["info"] })).toEqual([linhas[3]!]);
  });

  it("filtra por pod quando a linha informa o pod", () => {
    expect(buildLogPredicate({ pod: "api-1" })({ ts: "0", line: "x", pod: "api-2" })).toBe(false);
    expect(buildLogPredicate({ pod: "api-1" })({ ts: "0", line: "x", pod: "api-1" })).toBe(true);
  });
});

describe("SimulatedLogSource (sem LOKI_URL)", () => {
  const req = (filtros: LogRangeRequest["filtros"]): LogRangeRequest => ({
    query: "",
    start: "0",
    end: String(BigInt(NOW) * 1_000_000n),
    limit: 200,
    direction: "backward",
    filtros,
  });

  it("mantém as linhas de exemplo de antes", async () => {
    const lines = await new SimulatedLogSource().range(req({}));
    expect(lines.map((l) => l.line.slice(26))).toEqual([
      "INFO  server listening on :3000",
      "INFO  GET /health 200 2ms",
      "WARN  slow query 812ms",
      "INFO  POST /orders 201 41ms",
    ]);
  });

  it("aplica os mesmos filtros nas linhas de exemplo", async () => {
    const lines = await new SimulatedLogSource().range(req({ levels: ["warn"] }));
    expect(lines.map((l) => l.line.slice(26))).toEqual(["WARN  slow query 812ms"]);
  });

  it("não lista pods", async () => {
    expect(await new SimulatedLogSource().labelValues("pod", req({}))).toEqual([]);
  });
});
