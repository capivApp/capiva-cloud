export interface Deployment {
  id: string;
  version: string;
  status: string;
  imageRef: string | null;
  progress: number;
  startedAt: string;
  finishedAt: string | null;
}

/** Progresso publicado no SSE /streams/deployments/:id (evento `progress`). */
export interface DeploymentProgress {
  label: string;
  status: string;
  progress: number;
  done?: boolean;
}

export const DEPLOY_STATUS_ATIVOS = ["QUEUED", "BUILDING", "PUSHING", "DEPLOYING"] as const;

const ROLLBACK_LIMITE_PADRAO = 10;

export const isDeploymentAtivo = (status: string): boolean => (DEPLOY_STATUS_ATIVOS as readonly string[]).includes(status);

const isRestauravel = (deployment: Deployment): boolean => deployment.status === "HEALTHY" && Boolean(deployment.imageRef);

/**
 * Deploy a seguir pelo SSE. A lista vem do mais recente para o mais antigo; só o
 * primeiro conta, para um deploy antigo que ficou travado não prender a tela.
 */
export const findDeploymentAtivo = (deployments: Deployment[]): Deployment | null => {
  const [ultimo] = deployments;
  if (!ultimo || !isDeploymentAtivo(ultimo.status)) return null;
  return ultimo;
};

/**
 * Alvos de rollback: deploys saudáveis com imagem, menos o primeiro deles (é a
 * versão que está no ar). O backend recusa deploy sem imagem.
 */
export const findRollbackTargets = (deployments: Deployment[], limite = ROLLBACK_LIMITE_PADRAO): Deployment[] =>
  deployments.filter(isRestauravel).slice(1, limite + 1);
