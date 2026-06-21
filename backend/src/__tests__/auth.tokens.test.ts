import { describe, expect, it } from "bun:test";
import { generateRefreshToken, hashRefreshToken } from "@auth/tokens";
import { encrypt, decrypt } from "@functions/crypto";

describe("refresh tokens", () => {
  it("gera tokens opacos de alta entropia e únicos", () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(40);
  });

  it("hash é determinístico e não reversível ao valor cru", () => {
    const token = generateRefreshToken();
    expect(hashRefreshToken(token)).toBe(hashRefreshToken(token));
    expect(hashRefreshToken(token)).not.toContain(token);
  });
});

describe("cifragem de credenciais (AES-256-GCM)", () => {
  it("encripta e decripta round-trip", () => {
    const secret = "kubeconfig://super-secret";
    const cipher = encrypt(secret);
    expect(cipher).not.toContain(secret);
    expect(decrypt(cipher)).toBe(secret);
  });
});
