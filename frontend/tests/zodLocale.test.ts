/** Mensagem do Zod que ninguém escreveu à mão chega na tela em português. */
import { describe, expect, it } from "bun:test";
import { z } from "zod";

describe("locale do Zod", () => {
  it("mensagem padrão sai em português", () => {
    const result = z.string().safeParse(1);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).not.toMatch(/Invalid input/);
  });
});
