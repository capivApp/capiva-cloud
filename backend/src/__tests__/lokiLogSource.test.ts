/**
 * LokiLogSource contra um Loki falso (Bun.serve): parâmetros do query_range, leitura
 * dos streams com o pod, 4xx virando 400 em português, rede fora caindo na fonte
 * simulada e label values. Sem Loki de verdade.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createLogSource, LokiLogSource, SimulatedLogSource } from "@infra/observability/logSources";
import { HttpError } from "@functions/HttpError";
import type { LogRangeRequest } from "@interface/logs";

const requests: URL[] = [];
let server: ReturnType<typeof Bun.serve>;
let baseUrl = "";

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch(req) {
      const url = new URL(req.url);
      requests.push(url);
      if (url.searchParams.get("query")?.includes("quebrada")) return new Response("parse error", { status: 400 });
      if (url.pathname.startsWith("/loki/api/v1/label/")) return Response.json({ status: "success", data: ["api-1", "api-2"] });
      return Response.json({
        status: "success",
        data: {
          resultType: "streams",
          result: [
            { stream: { pod: "api-1" }, values: [["200", "b"], ["100", "a"]] },
            { stream: { pod: "api-2" }, values: [["150", "c"]] },
          ],
        },
      });
    },
  });
  baseUrl = `http://localhost:${server.port}`;
});

afterAll(() => server.stop(true));

const request = (query: string): LogRangeRequest => ({
  query,
  start: "1",
  end: "999",
  limit: 50,
  direction: "forward",
  filtros: {},
});

describe("LokiLogSource", () => {
  it("manda query, intervalo, limite e direção e lê o pod de cada stream", async () => {
    requests.length = 0;
    const lines = await new LokiLogSource(baseUrl).range(request('{namespace="a",app="b"} |= "x"'));
    const sent = requests[0];
    expect(sent.pathname).toBe("/loki/api/v1/query_range");
    expect(Object.fromEntries(sent.searchParams)).toEqual({ query: '{namespace="a",app="b"} |= "x"', limit: "50", start: "1", end: "999", direction: "forward" });
    expect(lines).toEqual([
      { ts: "200", line: "b", pod: "api-1" },
      { ts: "100", line: "a", pod: "api-1" },
      { ts: "150", line: "c", pod: "api-2" },
    ]);
  });

  it("filtro recusado pelo Loki vira 400 com mensagem em português", async () => {
    const error = await new LokiLogSource(baseUrl).range(request("quebrada")).catch((e) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect(error.status).toBe(400);
    expect(error.message).toBe("Não foi possível aplicar o filtro. Revise a busca e a expressão regular.");
  });

  it("Loki fora do ar cai na fonte simulada, como antes", async () => {
    const lines = await new LokiLogSource("http://127.0.0.1:1").range(request("{}"));
    expect(lines).toHaveLength(4);
  });

  it("lista valores de label", async () => {
    const values = await new LokiLogSource(baseUrl).labelValues("pod", request('{namespace="a",app="b"}'));
    expect(values).toEqual(["api-1", "api-2"]);
    expect(requests.at(-1)?.pathname).toBe("/loki/api/v1/label/pod/values");
  });
});

describe("createLogSource", () => {
  it("sem LOKI_URL usa a fonte simulada; com, o Loki", () => {
    expect(createLogSource(undefined)).toBeInstanceOf(SimulatedLogSource);
    expect(createLogSource("http://loki:3100")).toBeInstanceOf(LokiLogSource);
  });
});
