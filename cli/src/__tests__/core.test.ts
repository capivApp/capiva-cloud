/**
 * Núcleo da CLI: parser de argumentos, credenciais (env vence arquivo), arquivo de
 * config com permissão 600, cliente HTTP e leitor de SSE. fetch mockado, sem rede.
 */
import { afterEach, describe, expect, it, mock } from "bun:test";
import { mkdtempSync, rmSync, statSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { parseArgs } from "@core/args";
import { CliError } from "@core/errors";
import { createConfigStore, resolveCredentials } from "@core/config";
import { createApiClient } from "@core/api";
import { readSse } from "@core/sse";

describe("parseArgs", () => {
  it("separa posicionais de flags booleanas", () => {
    expect(parseArgs(["deploy", "api", "--wait", "--json"])).toEqual({
      positionals: ["deploy", "api"],
      flags: { wait: true, json: true },
    });
  });

  it("aceita valor com = e com espaço nas flags de valor", () => {
    expect(parseArgs(["login", "--token=cap_x", "--api-url", "https://c.io"]).flags).toEqual({
      token: "cap_x",
      "api-url": "https://c.io",
    });
  });

  it("traduz atalho curto", () => {
    expect(parseArgs(["logs", "api", "-f"]).flags).toEqual({ follow: true });
  });

  it("depois de -- tudo é posicional", () => {
    expect(parseArgs(["env", "set", "api", "--", "--X=1"]).positionals).toEqual([
      "env",
      "set",
      "api",
      "--X=1",
    ]);
  });

  it("flag de valor sem valor é erro", () => {
    expect(() => parseArgs(["login", "--token"])).toThrow(CliError);
  });
});

describe("resolveCredentials", () => {
  it("variável de ambiente vence o arquivo", () => {
    const resolved = resolveCredentials(
      { CAPIVA_TOKEN: "cap_env", CAPIVA_API_URL: "https://env.io/" },
      { token: "cap_file", apiUrl: "https://file.io" },
    );
    expect(resolved).toEqual({ token: "cap_env", apiUrl: "https://env.io" });
  });

  it("sem env, usa o arquivo", () => {
    expect(resolveCredentials({}, { token: "cap_file", apiUrl: "https://file.io" })).toEqual({
      token: "cap_file",
      apiUrl: "https://file.io",
    });
  });

  it("sem nada, pede login", () => {
    expect(() => resolveCredentials({}, null)).toThrow(/capiva login/);
  });
});

describe("createConfigStore", () => {
  let dir = "";
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("grava em XDG_CONFIG_HOME/capiva/config.json com permissão 600", async () => {
    dir = mkdtempSync(join(tmpdir(), "capiva-cli-"));
    const store = createConfigStore({ XDG_CONFIG_HOME: dir });
    await store.save({ token: "cap_a", apiUrl: "https://c.io" });
    expect(store.path).toBe(join(dir, "capiva", "config.json"));
    expect(statSync(store.path).mode & 0o777).toBe(0o600);
    expect(await store.load()).toEqual({ token: "cap_a", apiUrl: "https://c.io" });
  });

  it("arquivo ausente devolve null", async () => {
    dir = mkdtempSync(join(tmpdir(), "capiva-cli-"));
    expect(await createConfigStore({ XDG_CONFIG_HOME: dir }).load()).toBeNull();
  });
});

describe("createApiClient", () => {
  it("envia a chave no Authorization e prefixa /api", async () => {
    const fetchFn = mock(async (_url: string, _init?: RequestInit) =>
      Response.json([{ id: "p1" }]),
    );
    const api = createApiClient(
      { apiUrl: "https://c.io", token: "cap_a" },
      fetchFn as unknown as typeof fetch,
    );
    expect(await api.get<{ id: string }[]>("/projects")).toEqual([{ id: "p1" }]);
    expect(fetchFn.mock.calls[0]?.[0]).toBe("https://c.io/api/projects");
    const headers = (fetchFn.mock.calls[0]?.[1]?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer cap_a");
  });

  it("erro da API vira CliError com a mensagem do servidor", async () => {
    const fetchFn = mock(async () =>
      Response.json({ error: "NOT_FOUND", message: "Aplicação não encontrada." }, { status: 404 }),
    );
    const api = createApiClient(
      { apiUrl: "https://c.io", token: "cap_a" },
      fetchFn as unknown as typeof fetch,
    );
    expect(api.get("/applications/x")).rejects.toThrow("Aplicação não encontrada.");
  });

  it("204 devolve null", async () => {
    const fetchFn = mock(async () => new Response(null, { status: 204 }));
    const api = createApiClient(
      { apiUrl: "https://c.io", token: "cap_a" },
      fetchFn as unknown as typeof fetch,
    );
    expect(await api.delete("/applications/a/env/X")).toBeNull();
  });
});

describe("readSse", () => {
  it("lê eventos quebrados em vários pedaços", async () => {
    const chunks = [
      'event: progress\ndata: {"label":"Bu',
      'ild"}\n\nevent: progress\n',
      'data: {"done":true}\n\n',
    ];
    const body = new ReadableStream({
      start(controller) {
        for (const c of chunks) controller.enqueue(new TextEncoder().encode(c));
        controller.close();
      },
    });
    const events = [];
    for await (const event of readSse(new Response(body))) events.push(event);
    expect(events).toEqual([
      { event: "progress", data: { label: "Build" } },
      { event: "progress", data: { done: true } },
    ]);
  });
});
