/**
 * Aba e deploy destacado da tela da aplicação, lidos da URL. O status de commit no Git
 * aponta para `/applications/:id?deployment=:deploymentId` (CommitStatusService do backend).
 */
const ABA_PADRAO = "deploys";

export const readDeploymentDestacado = (params: URLSearchParams): string | null =>
  params.get("deployment") || null;

/** O link de um deploy sempre abre em Deploys, que é onde o deploy aparece. */
export const readApplicationTab = (params: URLSearchParams): string => {
  if (readDeploymentDestacado(params)) return ABA_PADRAO;
  return params.get("tab") ?? ABA_PADRAO;
};

export const isDeploymentDestacado = (deploymentId: string, destacado: string | null): boolean =>
  deploymentId === destacado;

/** Trocar de aba solta o deploy do link: senão ele puxaria a tela de volta para Deploys. */
export const writeApplicationTab = (current: URLSearchParams, tab: string): URLSearchParams => {
  const params = new URLSearchParams(current);
  params.set("tab", tab);
  params.delete("deployment");
  return params;
};

/** Ref de callback estável: rola até o deploy destacado quando a linha monta. */
export const scrollIntoDeployment = (element: HTMLElement | null): void => {
  element?.scrollIntoView({ block: "center", behavior: "smooth" });
};
