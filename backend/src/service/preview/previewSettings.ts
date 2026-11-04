/**
 * Configuração dos preview deployments, lida das variáveis de ambiente
 * (ver docs/20-variaveis-de-ambiente.md). Função, e não constante, para que o
 * teste e o scheduler leiam o valor atual.
 */
export interface PreviewSettings {
  /** Domínio base: o preview do PR 42 da app `api` fica em `pr-42-api.<domain>`. */
  domain: string | undefined;
  /** Dias sem atividade até o preview ser destruído pelo scheduler. */
  ttlDays: number;
}

const DEFAULT_TTL_DAYS = 7;

const parseTtlDays = (raw: string | undefined): number => {
  const days = Number(raw);
  if (!Number.isFinite(days) || days <= 0) return DEFAULT_TTL_DAYS;
  return days;
};

export const readPreviewSettings = (
  env: Record<string, string | undefined> = process.env,
): PreviewSettings => ({
  domain: env.CAPIVA_PREVIEW_DOMAIN?.trim() || undefined,
  ttlDays: parseTtlDays(env.CAPIVA_PREVIEW_TTL_DAYS),
});
