/** Papéis da organização, do menor para o maior (mesma ordem do `rbac.ts` do backend). */
export const ROLES = ["VIEWER", "DEVELOPER", "ADMIN", "OWNER"] as const;
export type Role = (typeof ROLES)[number];

/** Ações que a tela da aplicação oferece. */
export const ACOES_APLICACAO = ["redeploy", "rollback", "scale", "restart", "lifecycle"] as const;
export type AcaoAplicacao = (typeof ACOES_APLICACAO)[number];

export type PermissoesDaAplicacao = Record<AcaoAplicacao, boolean>;

// Espelho das rotas de /api/applications: toda mutação exige DEVELOPER+. Esconder
// na tela é conveniência; quem garante é o backend (403 para VIEWER).
const PAPEL_MINIMO: Record<AcaoAplicacao, Role> = {
  redeploy: "DEVELOPER",
  rollback: "DEVELOPER",
  scale: "DEVELOPER",
  restart: "DEVELOPER",
  lifecycle: "DEVELOPER",
};

const rankOf = (role: string | null | undefined): number => ROLES.indexOf(role as Role);

const isPapelSuficiente = (role: string | null | undefined, minimo: Role): boolean => {
  const rank = rankOf(role);
  return rank >= 0 && rank >= rankOf(minimo);
};

/** O que o papel pode fazer na aplicação. Papel ausente ou desconhecido não pode nada. */
export const buildPermissoesDaAplicacao = (role: string | null | undefined): PermissoesDaAplicacao =>
  Object.fromEntries(ACOES_APLICACAO.map((acao) => [acao, isPapelSuficiente(role, PAPEL_MINIMO[acao])])) as PermissoesDaAplicacao;
