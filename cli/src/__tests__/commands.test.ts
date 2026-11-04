/**
 * Comandos da CLI de ponta a ponta pelo `runCli`, com a API falsa de `fakeApi.ts`.
 * Cobre despacho, saída legível e `--json`, e cada comando. Sem rede, sem disco.
 */
import { describe, expect, it } from "bun:test";
import { runCli } from "@core/cli";
import { APPS, DEPLOYMENTS, makeDeps, sseResponse } from "@test/fakeApi";

const out = (lines: string[]) => lines.join("");

describe("despacho", () => {
  it("sem comando mostra a ajuda", async () => {
    const { deps, stdout } = makeDeps();
    expect(await runCli([], deps)).toBe(0);
    expect(out(stdout)).toContain("apps list");
    expect(out(stdout)).toContain("deploy <app>");
  });

  it("comando desconhecido sai com 2", async () => {
    const { deps, stderr } = makeDeps();
    expect(await runCli(["voar"], deps)).toBe(2);
    expect(out(stderr)).toContain("Comando desconhecido: voar");
  });

  it("sem credenciais, pede login", async () => {
    const { deps, stderr } = makeDeps({}, { credentials: null });
    expect(await runCli(["apps", "list"], deps)).toBe(1);
    expect(out(stderr)).toContain("capiva login");
  });

  it("aplicação inexistente sai com 1", async () => {
    const { deps, stderr } = makeDeps();
    expect(await runCli(["apps", "status", "nada"], deps)).toBe(1);
    expect(out(stderr)).toContain("Aplicação não encontrada: nada");
  });
});

describe("login", () => {
  it("valida a chave na API e grava a configuração", async () => {
    const { deps, stdout, saved, calls } = makeDeps({}, { credentials: null });
    expect(await runCli(["login", "--token", "cap_nova", "--api-url", "https://c.io/"], deps)).toBe(
      0,
    );
    expect(saved()).toEqual({ token: "cap_nova", apiUrl: "https://c.io" });
    expect(calls[0]?.path).toBe("/projects");
    expect(out(stdout)).toContain("Login feito");
  });

  it("recusa chave fora do formato cap_", async () => {
    const { deps, stderr } = makeDeps({}, { credentials: null });
    expect(await runCli(["login", "--token", "abc", "--api-url", "https://c.io"], deps)).toBe(1);
    expect(out(stderr)).toContain("cap_");
  });
});

describe("apps", () => {
  it("apps list mostra uma tabela", async () => {
    const { deps, stdout } = makeDeps();
    expect(await runCli(["apps", "list"], deps)).toBe(0);
    expect(out(stdout)).toMatch(/NOME\s+PROJETO\s+STATUS/);
    expect(out(stdout)).toMatch(/api\s+loja\s+running/);
  });

  it("apps list --json devolve JSON", async () => {
    const { deps, stdout } = makeDeps();
    await runCli(["apps", "list", "--json"], deps);
    expect(JSON.parse(out(stdout)).map((a: { name: string }) => a.name)).toEqual(["api", "web"]);
  });

  it("apps status mostra o último deploy", async () => {
    const { deps, stdout } = makeDeps();
    expect(await runCli(["apps", "status", "api"], deps)).toBe(0);
    expect(out(stdout)).toContain("running");
    expect(out(stdout)).toContain("abc1234");
  });

  it("aceita o id no lugar do nome", async () => {
    const { deps } = makeDeps();
    expect(await runCli(["apps", "status", "a1"], deps)).toBe(0);
  });
});

describe("deploy", () => {
  it("dispara e devolve o id", async () => {
    const { deps, stdout, calls } = makeDeps({
      "POST /applications/a1/deploy": () => ({ id: "d9", status: "QUEUED", version: "manual" }),
    });
    expect(await runCli(["deploy", "api"], deps)).toBe(0);
    expect(calls.some((c) => c.method === "POST" && c.path === "/applications/a1/deploy")).toBe(
      true,
    );
    expect(out(stdout)).toContain("d9");
  });

  it("--wait acompanha o SSE até o fim e sai com 0 quando saudável", async () => {
    const { deps, stdout, calls } = makeDeps({
      "POST /applications/a1/deploy": () => ({ id: "d9", status: "QUEUED" }),
      "GET /streams/deployments/d9": () =>
        sseResponse([
          { event: "snapshot", data: { id: "d9", status: "QUEUED" } },
          {
            event: "progress",
            data: { label: "Build iniciado", status: "BUILDING", progress: 10 },
          },
          {
            event: "progress",
            data: { label: "Health Check OK", status: "HEALTHY", progress: 100, done: true },
          },
        ]),
    });
    expect(await runCli(["deploy", "api", "--wait"], deps)).toBe(0);
    expect(out(stdout)).toContain("Build iniciado");
    expect(out(stdout)).toContain("Health Check OK");
    expect(calls.at(-1)?.headers.Authorization).toBe("Bearer cap_test");
  });

  it("--wait sai com 1 quando o deploy falha", async () => {
    const { deps } = makeDeps({
      "POST /applications/a1/deploy": () => ({ id: "d9", status: "QUEUED" }),
      "GET /streams/deployments/d9": () =>
        sseResponse([
          {
            event: "progress",
            data: { label: "capiva.json inválido: port", status: "FAILED", done: true },
          },
        ]),
    });
    expect(await runCli(["deploy", "api", "--wait"], deps)).toBe(1);
  });
});

describe("logs", () => {
  const logs = (batches: { ts: string; line: string }[][]) => () =>
    sseResponse(batches.map((data) => ({ event: "logs", data })));

  it("sem -f imprime o lote atual e sai", async () => {
    const { deps, stdout } = makeDeps({
      "GET /streams/applications/a1/logs": logs([
        [{ ts: "1", line: "subiu" }],
        [{ ts: "2", line: "depois" }],
      ]),
    });
    expect(await runCli(["logs", "api"], deps)).toBe(0);
    expect(out(stdout)).toContain("subiu");
    expect(out(stdout)).not.toContain("depois");
  });

  it("-f segue o stream sem repetir linhas", async () => {
    const { deps, stdout } = makeDeps({
      "GET /streams/applications/a1/logs": logs([
        [{ ts: "1", line: "um" }],
        [
          { ts: "1", line: "um" },
          { ts: "2", line: "dois" },
        ],
      ]),
    });
    expect(await runCli(["logs", "api", "-f"], deps)).toBe(0);
    expect(out(stdout).match(/um/g)?.length).toBe(1);
    expect(out(stdout)).toContain("dois");
  });
});

describe("env", () => {
  const ENV = [
    { key: "LOG_LEVEL", value: "debug", secret: false, source: "MANUAL" },
    { key: "DB_PASSWORD", value: "", secret: true, source: "MANUAL" },
    { key: "DATABASE_URL", value: "postgres://x", secret: false, source: "INJECTED" },
  ];

  it("env list mascara segredos", async () => {
    const { deps, stdout } = makeDeps({ "GET /applications/a1/env": () => ENV });
    expect(await runCli(["env", "list", "api"], deps)).toBe(0);
    expect(out(stdout)).toContain("LOG_LEVEL=debug");
    expect(out(stdout)).toContain("DB_PASSWORD=******");
  });

  it("env set mescla com as variáveis da tela e preserva segredos", async () => {
    let sent: unknown;
    const { deps } = makeDeps({
      "GET /applications/a1/env": () => ENV,
      "PUT /applications/a1/env": (body) => {
        sent = body;
        return ENV;
      },
    });
    expect(await runCli(["env", "set", "api", "LOG_LEVEL=info", "NOVA=a=b"], deps)).toBe(0);
    expect(sent).toEqual({
      vars: [
        { key: "LOG_LEVEL", value: "info", secret: false },
        { key: "DB_PASSWORD", value: "", secret: true },
        { key: "NOVA", value: "a=b", secret: false },
      ],
    });
  });

  it("env set recusa par sem =", async () => {
    const { deps, stderr } = makeDeps({ "GET /applications/a1/env": () => ENV });
    expect(await runCli(["env", "set", "api", "SEMVALOR"], deps)).toBe(2);
    expect(out(stderr)).toContain("KEY=VALUE");
  });

  it("env unset remove a chave", async () => {
    const { deps, calls } = makeDeps({ "DELETE /applications/a1/env/LOG_LEVEL": () => null });
    expect(await runCli(["env", "unset", "api", "LOG_LEVEL"], deps)).toBe(0);
    expect(calls.at(-1)).toMatchObject({
      method: "DELETE",
      path: "/applications/a1/env/LOG_LEVEL",
    });
  });
});

describe("rollback", () => {
  it("sem deployId, volta para o deploy saudável anterior ao atual", async () => {
    let sent: unknown;
    const { deps } = makeDeps({
      "POST /applications/a1/rollback": (body) => {
        sent = body;
        return { id: "d10", version: "rollback-0001111" };
      },
    });
    expect(await runCli(["rollback", "api"], deps)).toBe(0);
    expect(sent).toEqual({ deploymentId: DEPLOYMENTS[2]?.id });
  });

  it("com deployId, usa o informado", async () => {
    let sent: unknown;
    const { deps } = makeDeps({
      "POST /applications/a1/rollback": (body) => {
        sent = body;
        return { id: "d10" };
      },
    });
    await runCli(["rollback", "api", "d3"], deps);
    expect(sent).toEqual({ deploymentId: "d3" });
  });
});

describe("init", () => {
  const routes = {
    "GET /applications/a1/env": () => [
      { key: "LOG_LEVEL", value: "info", secret: false, source: "MANUAL" },
      { key: "TOKEN", value: "", secret: true, source: "MANUAL" },
      { key: "DATABASE_URL", value: "x", secret: false, source: "INJECTED" },
    ],
    "GET /applications/a1/domains": () => [{ id: "dm1", host: "api.loja.com" }],
    "GET /applications/a1/volumes": () => [
      { name: "dados", mountPath: "/data", sizeGi: 5, accessMode: "RWO" },
    ],
    "GET /applications/a1/scaling": () => ({
      minReplicas: 2,
      maxReplicas: 5,
      metric: "CPU",
      target: 70,
    }),
  };

  it("gera o capiva.json a partir da aplicação, sem segredos", async () => {
    const { deps, files } = makeDeps(routes);
    expect(await runCli(["init", "api"], deps)).toBe(0);
    const written = JSON.parse(files["/projeto/capiva.json"] ?? "{}");
    expect(written).toEqual({
      $schema: "https://capiva.test/schemas/capiva.json",
      build: {
        type: "GITHUB",
        dockerfile: "Dockerfile.prod",
        context: "apps/api",
        args: { NODE_ENV: "production" },
      },
      port: 8080,
      healthcheck: { path: "/health" },
      profile: "SMALL",
      autoscaling: { min: 2, max: 5, metric: "CPU", target: 70 },
      env: { LOG_LEVEL: "info" },
      volumes: [{ name: "dados", mountPath: "/data", sizeGi: 5, accessMode: "RWO" }],
      domains: ["api.loja.com"],
    });
  });

  it("não sobrescreve arquivo existente sem --force", async () => {
    const { deps, stderr } = makeDeps(routes, { files: { "/projeto/capiva.json": "{}" } });
    expect(await runCli(["init", "api"], deps)).toBe(1);
    expect(out(stderr)).toContain("--force");
  });

  it("--json imprime em vez de gravar", async () => {
    const { deps, stdout, files } = makeDeps(routes);
    await runCli(["init", "api", "--json"], deps);
    expect(JSON.parse(out(stdout)).port).toBe(APPS[0]?.port);
    expect(files["/projeto/capiva.json"]).toBeUndefined();
  });
});
