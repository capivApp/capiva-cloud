/**
 * Campos que o capiva.json aplica pelo PATCH da aplicação (réplicas e comandos de
 * build/start) e a réplica desejada lida pelo reconcile. Puro, sem banco.
 */
import { describe, expect, it } from "bun:test";
import { updateApplicationSchema } from "@schemas/application.schema";
import { desiredReplicasOf } from "@service/ApplicationService";

describe("updateApplicationSchema: campos do capiva.json", () => {
  it("aceita réplicas e comandos de build/start", () => {
    const parsed = updateApplicationSchema.parse({ replicas: 3, buildCommand: "bun run build", startCommand: "bun start" });
    expect(parsed).toEqual({ replicas: 3, buildCommand: "bun run build", startCommand: "bun start" });
  });

  it("recusa réplicas negativas", () => {
    expect(updateApplicationSchema.safeParse({ replicas: -1 }).success).toBe(false);
  });
});

describe("desiredReplicasOf", () => {
  it("usa as réplicas gravadas na configuração", () => {
    expect(desiredReplicasOf({ sourceConfig: { replicas: 4 } })).toBe(4);
  });

  it("sem configuração, mantém o padrão de 2 réplicas", () => {
    expect(desiredReplicasOf({ sourceConfig: {} })).toBe(2);
    expect(desiredReplicasOf({ sourceConfig: null })).toBe(2);
  });

  it("preview sem configuração roda com uma réplica", () => {
    expect(desiredReplicasOf({ sourceConfig: {}, previewOfId: "app-origem" })).toBe(1);
  });

  it("réplicas gravadas valem também para o preview", () => {
    expect(desiredReplicasOf({ sourceConfig: { replicas: 3 }, previewOfId: "app-origem" })).toBe(3);
  });
});
