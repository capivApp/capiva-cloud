/**
 * Rotas de logs no controller: validação da query string (422 em português), download
 * em streaming com nome de arquivo e formato, e erro antes do primeiro byte virando
 * JSON. ObservabilityService falso, Express real, sem banco e sem Loki.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import express from "express";
import type { Server } from "node:http";
import { ObservabilityController } from "@controller/ObservabilityController";
import { errorHandler } from "@middleware/errorHandler";
import { HttpError } from "@functions/HttpError";
import type { LogFiltros, LogLine } from "@interface/logs";

const NOW_NS = String(BigInt(Date.parse("2026-11-04T12:00:00.000Z")) * 1_000_000n);
const received: Array<{ filtros: LogFiltros; maxLines?: number }> = [];

const fakeObservability = {
  async searchLogs(_id: string, _t: unknown, filtros: LogFiltros) {
    received.push({ filtros });
    return { lines: [] };
  },
  async exportLogs(id: string, _t: unknown, filtros: LogFiltros, maxLines: number) {
    received.push({ filtros, maxLines });
    if (id === "falha") throw HttpError.badRequest("Não foi possível aplicar o filtro.");
    async function* pages(): AsyncGenerator<LogLine[]> {
      yield [{ ts: NOW_NS, line: "ERROR a", pod: "api-1", level: "error" }];
      yield [{ ts: NOW_NS, line: "INFO b" }];
    }
    return { app: "minha api", pages: pages() };
  },
};

let server: Server;
let base = "";

beforeAll(async () => {
  const ctrl = new ObservabilityController(
    fakeObservability as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const app = express();
  app.get("/apps/:id/logs", ctrl.searchLogs);
  app.get("/apps/:id/logs/download", ctrl.downloadLogs);
  app.use(errorHandler);
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://localhost:${(server.address() as { port: number }).port}`;
});

afterAll(() => server.close());

const get = (path: string) =>
  fetch(`${base}${path}`, { headers: { "x-organization-id": "org-1" } });

describe("GET /logs", () => {
  it("repassa os filtros já convertidos para o service", async () => {
    received.length = 0;
    const res = await get(
      "/apps/a1/logs?q=timeout&level=error,warn&since=15m&namespace=kube-system",
    );
    expect(res.status).toBe(200);
    expect(received[0]?.filtros).toEqual({
      contains: "timeout",
      levels: ["error", "warn"],
      since: "15m",
    });
  });

  it("filtro inválido vira 422 com mensagem em português", async () => {
    const res = await get("/apps/a1/logs?regex=(abc");
    expect(res.status).toBe(422);
    const body = (await res.json()) as { issues: Array<{ message: string }> };
    expect(body.issues[0]?.message).toBe("Expressão regular inválida.");
  });
});

describe("GET /logs/download", () => {
  it("txt em streaming, com nome de arquivo seguro", async () => {
    const res = await get("/apps/a1/logs/download?maxLines=100");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(res.headers.get("content-disposition")).toMatch(
      /^attachment; filename="minha-api-logs-\d{8}-\d{6}\.txt"$/,
    );
    expect(await res.text()).toBe(
      "2026-11-04T12:00:00.000Z [api-1] ERROR a\n2026-11-04T12:00:00.000Z INFO b\n",
    );
    expect(received.at(-1)?.maxLines).toBe(100);
  });

  it("ndjson", async () => {
    const res = await get("/apps/a1/logs/download?format=ndjson");
    expect(res.headers.get("content-type")).toBe("application/x-ndjson; charset=utf-8");
    const lines = (await res.text())
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(lines.map((l) => l.line)).toEqual(["ERROR a", "INFO b"]);
  });

  it("erro antes do arquivo começar volta como JSON", async () => {
    const res = await get("/apps/falha/logs/download");
    expect(res.status).toBe(400);
    expect(((await res.json()) as { message: string }).message).toBe(
      "Não foi possível aplicar o filtro.",
    );
  });

  it("recusa máximo de linhas acima do teto", async () => {
    const res = await get("/apps/a1/logs/download?maxLines=999999");
    expect(res.status).toBe(422);
  });
});
