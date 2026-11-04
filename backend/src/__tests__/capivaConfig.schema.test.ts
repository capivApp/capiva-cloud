/**
 * Schema do capiva.json: o que é aceito, o que é recusado (com mensagem em
 * português) e o JSON Schema publicado para o editor. Puro, sem banco.
 */
import { describe, expect, it } from "bun:test";
import {
  buildCapivaJsonSchema,
  CapivaConfigError,
  parseCapivaConfig,
} from "@schemas/capivaConfig.schema";

const COMPLETO = {
  $schema: "https://capiva.exemplo.com/schemas/capiva.json",
  build: {
    type: "GITHUB",
    dockerfile: "docker/Dockerfile.prod",
    context: "apps/api",
    buildCommand: "bun run build",
    startCommand: "bun start",
    args: { NODE_ENV: "production" },
  },
  port: 8080,
  healthcheck: { path: "/health" },
  profile: "MEDIUM",
  replicas: 3,
  autoscaling: { min: 2, max: 6, metric: "CPU", target: 70 },
  env: { LOG_LEVEL: "info" },
  volumes: [{ name: "dados", mountPath: "/data", sizeGi: 5 }],
  domains: ["api.exemplo.com"],
};

describe("parseCapivaConfig", () => {
  it("aceita um arquivo completo", () => {
    const config = parseCapivaConfig(JSON.stringify(COMPLETO));
    expect(config.port).toBe(8080);
    expect(config.build?.context).toBe("apps/api");
    expect(config.volumes?.[0]?.accessMode).toBe("RWO");
  });

  it("aceita arquivo vazio (nada declarado)", () => {
    expect(parseCapivaConfig("{}")).toEqual({});
  });

  it("recusa JSON malformado com mensagem em português", () => {
    expect(() => parseCapivaConfig("{ port: 3000")).toThrow(CapivaConfigError);
    expect(() => parseCapivaConfig("{ port: 3000")).toThrow(/não é um JSON válido/);
  });

  it("recusa chave desconhecida, apontando o caminho", () => {
    expect(() => parseCapivaConfig(JSON.stringify({ prot: 3000 }))).toThrow(/prot/);
  });

  it("recusa caminho de build com travessia", () => {
    const raw = JSON.stringify({ build: { dockerfile: "../../etc/passwd" } });
    expect(() => parseCapivaConfig(raw)).toThrow(/build\.dockerfile/);
  });

  it("recusa porta fora do intervalo com mensagem em português", () => {
    expect(() => parseCapivaConfig(JSON.stringify({ port: 70000 }))).toThrow(/Porta/);
  });

  it("recusa chave de variável inválida", () => {
    expect(() => parseCapivaConfig(JSON.stringify({ env: { "1ABC": "x" } }))).toThrow(/env/);
  });

  it("recusa autoscaling com máximo menor que o mínimo", () => {
    const raw = JSON.stringify({ autoscaling: { min: 5, max: 2, target: 70 } });
    expect(() => parseCapivaConfig(raw)).toThrow(/máximo/);
  });

  it("recusa domínio inválido", () => {
    expect(() => parseCapivaConfig(JSON.stringify({ domains: ["nao é domínio"] }))).toThrow(
      /domains/,
    );
  });

  it("a mensagem nunca leva travessão", () => {
    try {
      parseCapivaConfig(JSON.stringify({ port: "abc", prot: 1 }));
    } catch (error) {
      expect((error as Error).message).not.toContain("—");
    }
  });
});

describe("buildCapivaJsonSchema", () => {
  it("gera JSON Schema serializável com as seções do arquivo", () => {
    const schema = buildCapivaJsonSchema();
    const properties = (schema.properties ?? {}) as Record<string, unknown>;
    expect(Object.keys(properties)).toEqual(
      expect.arrayContaining([
        "$schema",
        "build",
        "port",
        "healthcheck",
        "profile",
        "replicas",
        "autoscaling",
        "env",
        "volumes",
        "domains",
      ]),
    );
    expect(() => JSON.stringify(schema)).not.toThrow();
  });
});
