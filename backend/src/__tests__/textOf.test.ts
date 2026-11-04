/** textOf: lê como texto um campo de JSON externo (`unknown`), sem virar "[object Object]". */
import { describe, expect, it } from "bun:test";
import { textOf } from "@functions/textOf";

describe("textOf", () => {
  it("devolve a string como veio", () => {
    expect(textOf("RolloutAborted: análise falhou")).toBe("RolloutAborted: análise falhou");
  });

  it("ausente vira o fallback, vazio por padrão", () => {
    expect(textOf(undefined)).toBe("");
    expect(textOf(null, "http://localhost")).toBe("http://localhost");
  });

  it("o que não é string também vira o fallback", () => {
    expect(textOf({ url: "s3://x" })).toBe("");
    expect(textOf(42, "nada")).toBe("nada");
  });
});
