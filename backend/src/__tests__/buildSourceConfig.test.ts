/**
 * Validação das chaves de build por origem no `sourceConfig` (Static, Buildpacks, Compose).
 * Só schema Zod, sem banco.
 */
import { describe, expect, it } from "bun:test";
import { createApplicationSchema } from "@schemas/application.schema";

const baseApp = { projectId: "prj_1", environmentId: "env_1", name: "site" };

const parse = (source: string, sourceConfig: Record<string, unknown>) =>
  createApplicationSchema.safeParse({ ...baseApp, source, sourceConfig });

const issuePaths = (result: ReturnType<typeof parse>) => (result.success ? [] : result.error.issues.map((i) => i.path.join(".")));

describe("sourceConfig das estratégias de build", () => {
  it("aceita a configuração de Static, Buildpacks e Compose", () => {
    expect(parse("STATIC", { outputDir: "build", buildCommand: "npm run build", spa: true }).success).toBe(true);
    expect(parse("BUILDPACKS", { builder: "paketobuildpacks/builder-jammy-base:0.4.1" }).success).toBe(true);
    expect(parse("DOCKER_COMPOSE", { compose: "compose.yml", composeService: "web_1" }).success).toBe(true);
  });

  // O diretório de saída vira um COPY no Dockerfile gerado: mesma regra de caminho do Dockerfile.
  it("recusa diretório de saída fora do repositório", () => {
    expect(issuePaths(parse("STATIC", { outputDir: "../../etc" }))).toContain("sourceConfig.outputDir");
  });

  it("recusa builder que não é referência de imagem", () => {
    expect(issuePaths(parse("BUILDPACKS", { builder: "paketo; rm -rf /" }))).toContain("sourceConfig.builder");
  });

  it("recusa nome de serviço do compose inválido", () => {
    expect(issuePaths(parse("DOCKER_COMPOSE", { composeService: "web app" }))).toContain("sourceConfig.composeService");
  });
});
