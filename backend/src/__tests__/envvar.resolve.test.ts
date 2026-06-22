import { describe, expect, it } from "bun:test";
import { resolveStoredValue } from "@service/EnvVarService";
import { decrypt } from "@functions/crypto";

describe("EnvVarService.resolveStoredValue", () => {
  it("mantém valor não-secreto em texto puro", () => {
    expect(resolveStoredValue({ key: "URL", value: "http://x", secret: false }, undefined)).toBe("http://x");
  });

  it("cifra valor secreto informado (não fica em texto puro)", () => {
    const stored = resolveStoredValue({ key: "TOKEN", value: "s3cr3t", secret: true }, undefined);
    expect(stored).not.toBe("s3cr3t");
    expect(decrypt(stored)).toBe("s3cr3t");
  });

  it("segredo salvo em branco preserva o cifrado anterior", () => {
    const previous = { value: encryptedFixture("antigo"), secret: true };
    const stored = resolveStoredValue({ key: "TOKEN", value: "", secret: true }, previous);
    expect(stored).toBe(previous.value);
    expect(decrypt(stored)).toBe("antigo");
  });

  it("segredo novo (sem anterior) com valor em branco cifra string vazia", () => {
    const stored = resolveStoredValue({ key: "TOKEN", value: "", secret: true }, undefined);
    expect(decrypt(stored)).toBe("");
  });
});

function encryptedFixture(plain: string): string {
  // Usa a própria regra para produzir um cifrado válido de referência.
  return resolveStoredValue({ key: "x", value: plain, secret: true }, undefined);
}
