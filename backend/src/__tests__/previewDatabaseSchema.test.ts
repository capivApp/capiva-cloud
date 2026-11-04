/** O modo do banco do preview chega pelo PATCH da aplicação: só `copy` ou `shared`. */
import { describe, expect, it } from "bun:test";
import { updateApplicationSchema } from "@schemas/application.schema";

describe("updateApplicationSchema: previewsDatabase", () => {
  it("aceita cópia e compartilhado", () => {
    expect(updateApplicationSchema.parse({ previewsDatabase: "copy" })).toEqual({
      previewsDatabase: "copy",
    });
    expect(updateApplicationSchema.parse({ previewsDatabase: "shared" })).toEqual({
      previewsDatabase: "shared",
    });
  });

  it("recusa outro valor com mensagem em português", () => {
    const result = updateApplicationSchema.safeParse({ previewsDatabase: "vazio" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Escolha cópia do banco ou banco compartilhado.");
  });
});
