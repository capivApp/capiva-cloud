/**
 * Hash de senha com Argon2id (nativo do Bun). Nenhuma senha em texto puro.
 */
export function hashPassword(plain: string): Promise<string> {
  return Bun.password.hash(plain, {
    algorithm: "argon2id",
    memoryCost: 19456, // ~19 MiB (recomendação OWASP)
    timeCost: 2,
  });
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return Bun.password.verify(plain, hash);
}
