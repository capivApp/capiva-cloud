import { describe, expect, it } from "bun:test";
import { createApplicationSchema, repoPathSchema, updateApplicationSchema } from "@schemas/application.schema";

describe("repoPathSchema", () => {
  it("aceita caminhos relativos, inclusive em subpastas", () => {
    for (const path of ["Dockerfile", "Dockerfile.prod", "docker/Dockerfile", "apps/api/Dockerfile.api"]) {
      expect(repoPathSchema.safeParse(path).success).toBe(true);
    }
  });

  // O valor vai direto para os argumentos do Job de build: caminho absoluto ou
  // travessia apontariam o build para fora do contexto clonado.
  it("recusa caminho absoluto e travessia de diretório", () => {
    for (const path of ["/etc/passwd", "../../Dockerfile", "apps/../../etc/shadow"]) {
      expect(repoPathSchema.safeParse(path).success).toBe(false);
    }
  });

  it("recusa vazio e caracteres de controle", () => {
    expect(repoPathSchema.safeParse("").success).toBe(false);
    expect(repoPathSchema.safeParse("Docker\nfile").success).toBe(false);
  });
});

const baseApp = {
  projectId: "prj_1",
  environmentId: "env_1",
  name: "api",
  source: "GITHUB" as const,
};

describe("createApplicationSchema — sourceConfig", () => {
  it("aceita dockerfile e contexto de build informados pelo usuário", () => {
    const parsed = createApplicationSchema.safeParse({
      ...baseApp,
      sourceConfig: { dockerfile: "docker/Dockerfile.prod", subPath: "apps/api" },
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.sourceConfig.dockerfile).toBe("docker/Dockerfile.prod");
  });

  it("rejeita dockerfile com travessia mesmo vindo de um campo livre", () => {
    const parsed = createApplicationSchema.safeParse({
      ...baseApp,
      sourceConfig: { dockerfile: "../../../etc/passwd" },
    });
    expect(parsed.success).toBe(false);
  });

  it("não exige as chaves de build (origens sem Dockerfile)", () => {
    expect(createApplicationSchema.safeParse({ ...baseApp, source: "NIXPACKS", sourceConfig: {} }).success).toBe(true);
  });
});

describe("updateApplicationSchema — configuração de build editável", () => {
  it("aceita alterar dockerfile, contexto e deploy automático", () => {
    const parsed = updateApplicationSchema.safeParse({
      dockerfile: "Dockerfile.api",
      subPath: "services/api",
      autoDeploy: false,
      watchPaths: ["services/api", "packages/shared"],
    });
    expect(parsed.success).toBe(true);
  });

  // String vazia é o sinal de "limpar o campo" (o service remove a chave do
  // sourceConfig); precisa passar na validação em vez de virar erro de caminho.
  it("aceita string vazia como limpeza do campo", () => {
    const parsed = updateApplicationSchema.safeParse({ dockerfile: "", port: 8080 });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.dockerfile).toBe("");
  });

  it("rejeita caminho inválido na edição", () => {
    expect(updateApplicationSchema.safeParse({ subPath: "/abs/path" }).success).toBe(false);
  });
});

// Regressão: o documento OpenAPI é gerado por z.toJSONSchema a partir destes
// schemas. Um `.transform()` em qualquer campo quebra a rota /docs inteira.
describe("schemas convertíveis para JSON Schema (/docs)", () => {
  it("createApplicationSchema e updateApplicationSchema geram JSON Schema", async () => {
    const { z } = await import("zod");
    expect(() => z.toJSONSchema(createApplicationSchema)).not.toThrow();
    expect(() => z.toJSONSchema(updateApplicationSchema)).not.toThrow();
  });
});
