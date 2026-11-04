import type { Application } from "@prisma-generated/client";
import type { PullRequestEvent } from "@infra/realtime/GitEventBus";

/**
 * Filtros de elegibilidade dos preview deployments. Funções puras: quem decide
 * QUAIS aplicações reagem a um PR é este arquivo, não o service.
 */
type SourceConfig = Record<string, unknown> & { previews?: { enabled?: unknown } };

const DAY_MS = 24 * 60 * 60 * 1000;

const sourceConfigOf = (app: Application): SourceConfig => (app.sourceConfig ?? {}) as SourceConfig;

const repoOf = (app: Application): string | undefined => {
  const cfg = sourceConfigOf(app);
  return (cfg.repo as string | undefined) ?? (cfg.fullName as string | undefined);
};

const branchOf = (app: Application): string => (sourceConfigOf(app).branch as string | undefined) ?? "main";

export const isPreview = (app: Pick<Application, "previewOfId">): boolean => Boolean(app.previewOfId);

/** Toggle "Ambientes de preview por PR" (`sourceConfig.previews.enabled`, default false). */
export const isPreviewsHabilitados = (app: Application): boolean => sourceConfigOf(app).previews?.enabled === true;

/**
 * A aplicação é deste repositório nesta conexão. Mesma regra do push: sem repo
 * gravado na aplicação, a conexão basta.
 */
export const isOrigemDoRepositorio = (app: Application, event: PullRequestEvent): boolean => {
  if (isPreview(app)) return false;
  if (app.gitConnectionId !== event.connectionId) return false;
  const repo = repoOf(app);
  return !repo || repo === event.repo;
};

/** Cria/redeploya preview: previews ligados e a branch de deploy é o alvo do PR. */
export const isOrigemElegivelParaPreview = (app: Application, event: PullRequestEvent): boolean =>
  isOrigemDoRepositorio(app, event) && isPreviewsHabilitados(app) && branchOf(app) === event.targetBranch;

/**
 * Preview parado há mais de `ttlDays`. A atividade é o `updatedAt`: todo evento
 * do PR regrava o preview (sha do head), e todo deploy atualiza o status.
 */
export const isPreviewExpirado = (app: Application, now: Date, ttlDays: number): boolean =>
  isPreview(app) && now.getTime() - app.updatedAt.getTime() > ttlDays * DAY_MS;
