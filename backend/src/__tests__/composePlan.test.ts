/**
 * Script do initContainer `compose-plan`: lê o docker-compose, escolhe o serviço e deixa
 * contexto e Dockerfile em caminhos fixos para o Kaniko. Roda o script de verdade com o
 * Bun local, num diretório temporário. Sem cluster.
 */
import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { COMPOSE_PLAN_SCRIPT } from "@infra/build/composePlanScript";

const workspaces: string[] = [];

const makeWorkspace = (files: Record<string, string>) => {
  const workspace = mkdtempSync(join(tmpdir(), "compose-plan-"));
  workspaces.push(workspace);
  for (const [path, content] of Object.entries(files)) {
    const full = join(workspace, "src", path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  return workspace;
};

const runPlan = (workspace: string, composeFile = "docker-compose.yml", service = "") =>
  Bun.spawnSync(["bun", "-e", COMPOSE_PLAN_SCRIPT], {
    env: {
      ...process.env,
      REPO_DIR: join(workspace, "src"),
      COMPOSE_FILE: join(workspace, "src", composeFile),
      COMPOSE_SERVICE: service,
      OUT_CONTEXT: join(workspace, "context"),
      OUT_DOCKERFILE: join(workspace, "Dockerfile.compose"),
    },
  });

afterEach(() => {
  for (const workspace of workspaces.splice(0)) rmSync(workspace, { recursive: true, force: true });
});

describe("compose-plan", () => {
  it("usa o primeiro serviço com build quando nenhum é informado", () => {
    const workspace = makeWorkspace({
      "docker-compose.yml":
        "services:\n  db:\n    image: postgres:16\n  api:\n    build:\n      context: ./api\n      dockerfile: Dockerfile.prod\n",
      "api/Dockerfile.prod": "FROM alpine\n",
      "api/index.js": "1",
    });
    const result = runPlan(workspace);
    expect(result.exitCode).toBe(0);
    expect(readFileSync(join(workspace, "Dockerfile.compose"), "utf8")).toBe("FROM alpine\n");
    expect(existsSync(join(workspace, "context", "index.js"))).toBe(true);
  });

  it("respeita o serviço escolhido e a forma curta `build: ./dir`", () => {
    const workspace = makeWorkspace({
      "docker-compose.yml": "services:\n  api:\n    build: ./api\n  web:\n    build: ./web\n",
      "api/Dockerfile": "FROM api\n",
      "web/Dockerfile": "FROM web\n",
    });
    expect(runPlan(workspace, "docker-compose.yml", "web").exitCode).toBe(0);
    expect(readFileSync(join(workspace, "Dockerfile.compose"), "utf8")).toBe("FROM web\n");
  });

  it("aceita Dockerfile fora do contexto, desde que dentro do repositório", () => {
    const workspace = makeWorkspace({
      "deploy/compose.yml":
        "services:\n  api:\n    build:\n      context: ../app\n      dockerfile: ../deploy/api.Dockerfile\n",
      "deploy/api.Dockerfile": "FROM deploy\n",
      "app/main.go": "package main",
    });
    expect(runPlan(workspace, "deploy/compose.yml").exitCode).toBe(0);
    expect(readFileSync(join(workspace, "Dockerfile.compose"), "utf8")).toBe("FROM deploy\n");
    expect(existsSync(join(workspace, "context", "main.go"))).toBe(true);
  });

  it("usa o dockerfile_inline quando o compose traz a receita embutida", () => {
    const workspace = makeWorkspace({
      "docker-compose.yml":
        "services:\n  api:\n    build:\n      context: .\n      dockerfile_inline: |\n        FROM inline\n",
    });
    expect(runPlan(workspace).exitCode).toBe(0);
    expect(readFileSync(join(workspace, "Dockerfile.compose"), "utf8")).toBe("FROM inline\n");
  });

  it("falha quando o serviço não tem build", () => {
    const workspace = makeWorkspace({
      "docker-compose.yml": "services:\n  db:\n    image: postgres:16\n",
    });
    const result = runPlan(workspace, "docker-compose.yml", "db");
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain("db");
  });

  // O contexto vem do repositório do usuário: não pode apontar para fora do clone.
  it("recusa contexto fora do repositório", () => {
    const workspace = makeWorkspace({
      "docker-compose.yml": "services:\n  api:\n    build: ../../etc\n",
    });
    expect(runPlan(workspace).exitCode).not.toBe(0);
    expect(existsSync(join(workspace, "context"))).toBe(false);
  });

  it("recusa contexto remoto (URL Git)", () => {
    const workspace = makeWorkspace({
      "docker-compose.yml": "services:\n  api:\n    build: https://github.com/acme/api.git\n",
    });
    expect(runPlan(workspace).exitCode).not.toBe(0);
  });
});
