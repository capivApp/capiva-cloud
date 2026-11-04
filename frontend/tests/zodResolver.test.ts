/**
 * O resolver do React Hook Form precisa entender os erros do Zod 4: senão o
 * submit lança em vez de marcar o campo (LoginPage, AlertsTab, restore).
 */
import { describe, expect, it } from "bun:test";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

describe("zodResolver com Zod 4", () => {
  it("devolve o erro no campo em vez de lançar", async () => {
    const schema = z.object({ email: z.string().email("Informe um e-mail válido.") });
    const result = await zodResolver(schema)({ email: "x" }, undefined, {
      fields: {},
      shouldUseNativeValidation: false,
    });
    expect(result.errors.email?.message).toBe("Informe um e-mail válido.");
  });
});
