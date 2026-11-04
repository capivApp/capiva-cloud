/**
 * Rascunho de formulário que recomeça quando o dado do servidor muda, sem setState em efeito.
 * Função pura, sem React.
 *
 * Fica fora de `src` porque o tsconfig do frontend não carrega os tipos do `bun:test`.
 */
import { describe, expect, it } from "bun:test";
import { nextDraftState } from "@/hooks/useSyncedDraft";

describe("nextDraftState", () => {
  it("mesma chave mantém o rascunho editado (mesma referência)", () => {
    const state = { key: "a", draft: ["editado"] };
    expect(nextDraftState(state, "a", () => ["servidor"])).toBe(state);
  });

  it("chave nova recomeça o rascunho a partir do servidor", () => {
    const state = { key: "a", draft: ["editado"] };
    expect(nextDraftState(state, "b", () => ["servidor"])).toEqual({
      key: "b",
      draft: ["servidor"],
    });
  });

  it("o build recebe o rascunho anterior, para manter o que o servidor não trouxe", () => {
    const state = { key: "a", draft: 7 };
    expect(nextDraftState(state, null, (prev) => prev ?? 0)).toEqual({ key: null, draft: 7 });
  });
});
