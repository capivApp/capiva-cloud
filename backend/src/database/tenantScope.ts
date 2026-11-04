import { requireTransactionContext } from "@database/context";

/**
 * Escopo multi-tenant do data layer.
 *
 * O `organizationId` do contexto transacional (AsyncLocalStorage) deixa de ser
 * informativo e passa a ser um FILTRO obrigatório: toda busca por id feita a
 * partir de entrada do usuário é restrita à organização ativa.
 *
 * Sem isto, `findUnique({ where: { id } })` atende qualquer id de qualquer
 * organização — o RBAC valida o papel do usuário na org DELE e o recurso de
 * outra org é servido do mesmo jeito (IDOR entre tenants).
 *
 * Cada modelo declara como chegar até a organização (direto ou por relação).
 */
type ScopeBuilder = (organizationId: string) => Record<string, unknown>;

const byOrganization: ScopeBuilder = (organizationId) => ({ organizationId });
const byProject: ScopeBuilder = (organizationId) => ({ project: { organizationId } });
const byApplication: ScopeBuilder = (organizationId) => ({ application: { project: { organizationId } } });
const byCluster: ScopeBuilder = (organizationId) => ({ cluster: { organizationId } });

const SCOPES = {
  organization: (organizationId: string) => ({ id: organizationId }),

  // Ligação direta com a organização.
  cluster: byOrganization,
  environment: byOrganization,
  gitConnection: byOrganization,
  project: byOrganization,
  tlsCertificate: byOrganization,
  dockerRegistry: byOrganization,
  storageProvider: byOrganization,
  invitation: byOrganization,
  apiKey: byOrganization,
  notificationChannel: byOrganization,
  secretStore: byOrganization,

  // Ligação por cluster.
  clusterNode: byCluster,
  provisioningTask: byCluster,

  // Ligação por projeto.
  application: byProject,
  managedDatabase: byProject,
  worker: byProject,
  cronJob: byProject,

  // Ligação por aplicação.
  deployment: byApplication,
  domain: byApplication,
  envVar: byApplication,
  scalingPolicy: byApplication,
  volume: byApplication,
  uptimeCheck: byApplication,

  // Backup de banco chega na org pelo banco gerenciado. Backup de VOLUME não tem
  // relação no schema (`volumeId` é solto) — quem resolve volume valida a posse
  // pela aplicação antes de chegar aqui (ver VolumeBackupService).
  backup: (organizationId: string) => ({ database: { project: { organizationId } } }),
} satisfies Record<string, ScopeBuilder>;

export type TenantScopedModel = keyof typeof SCOPES;

/**
 * Fragmento de `where` que restringe o modelo à organização ativa.
 * Falha alto se não houver organização no contexto: um repositório que pede
 * escopo sem tenant é bug de chamada, não motivo para servir dados de todos.
 */
export function tenantScope(model: TenantScopedModel): Record<string, unknown> {
  const { tenant } = requireTransactionContext();
  if (!tenant.organizationId) {
    throw new Error(
      `Consulta a "${model}" exige organização no contexto. Use withTransaction(fn, { tenant: { organizationId } }).`,
    );
  }
  return SCOPES[model](tenant.organizationId);
}
