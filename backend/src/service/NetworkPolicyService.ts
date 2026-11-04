import { Injectable } from "@di/index";
import { ApplicationRepository } from "@repository/ApplicationRepository";
import { EnvironmentRepository } from "@repository/EnvironmentRepository";
import { ServiceDependencyRepository } from "@repository/ServiceDependencyRepository";
import { KubeContextResolver } from "@service/KubeContextResolver";
import { KubernetesAdapter } from "@infra/kubernetes/KubernetesAdapter";
import {
  planTenantNetworkPolicies,
  resolveNetworkPolicyPlatform,
  type NetworkPolicyPlatform,
  type TenantNetworkPolicyInput,
} from "@infra/kubernetes/networkPolicyManifests";
import { withTransaction } from "@database/withTransaction";
import { HttpError } from "@functions/HttpError";

export interface NetworkPolicyRows {
  environment: { namespace: string; networkIsolation: boolean };
  apps: { name: string }[];
  dependencies: { source: { name: string; environment: { namespace: string } }; target: { name: string } }[];
  platform: NetworkPolicyPlatform;
}

export function buildNetworkPolicyInput(rows: NetworkPolicyRows): TenantNetworkPolicyInput & { enabled: boolean } {
  return {
    namespace: rows.environment.namespace,
    enabled: rows.environment.networkIsolation,
    apps: rows.apps.map((app) => app.name),
    peers: rows.dependencies.map((dep) => ({
      target: dep.target.name,
      source: dep.source.name,
      sourceNamespace: dep.source.environment.namespace,
    })),
    platform: rows.platform,
  };
}

/**
 * Mantém a NetworkPolicy padrão do namespace de um ambiente em dia com o estado
 * desejado: isolamento ligado/desligado, apps do ambiente e dependências que
 * chegam nelas. Idempotente: roda na criação/edição do ambiente, a cada
 * reconcile de aplicação e quando uma dependência é criada ou removida.
 */
@Injectable()
export class NetworkPolicyService {
  constructor(
    private readonly environments: EnvironmentRepository,
    private readonly apps: ApplicationRepository,
    private readonly deps: ServiceDependencyRepository,
    private readonly kube: KubeContextResolver,
    private readonly k8s: KubernetesAdapter,
  ) {}

  async syncEnvironment(environmentId: string, tenant: { organizationId: string }): Promise<void> {
    const rows = await withTransaction(() => this.findRows(environmentId), { tenant });
    const plan = planTenantNetworkPolicies(buildNetworkPolicyInput(rows));
    const ctx = await this.kube.forEnvironment(environmentId, tenant);
    for (const manifest of plan.apply) await this.k8s.apply(ctx, manifest);
    for (const manifest of plan.remove) await this.k8s.remove(ctx, manifest.apiVersion, manifest.kind, manifest.metadata.name);
  }

  /** Falha de cluster não pode desfazer a gravação que disparou a sincronização. */
  syncEnvironmentQuietly(environmentId: string, tenant: { organizationId: string }): Promise<void> {
    return this.syncEnvironment(environmentId, tenant).catch((error) => {
      console.error("[network-policy] sincronização falhou:", (error as Error).message);
    });
  }

  private async findRows(environmentId: string): Promise<NetworkPolicyRows> {
    const environment = await this.environments.findById(environmentId);
    if (!environment) throw HttpError.notFound("Ambiente não encontrado.");
    return {
      environment,
      apps: await this.apps.listByEnvironment(environmentId),
      dependencies: await this.deps.listIncomingForEnvironment(environmentId),
      platform: resolveNetworkPolicyPlatform(),
    };
  }
}
