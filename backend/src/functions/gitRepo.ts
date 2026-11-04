/** Repositório Git (`owner/nome`) gravado no sourceConfig da aplicação: `repo` ou `fullName`. */
export const repoOf = (sourceConfig: unknown): string | undefined => {
  const cfg = (sourceConfig ?? {}) as Record<string, unknown>;
  return (cfg.repo as string | undefined) ?? (cfg.fullName as string | undefined);
};
