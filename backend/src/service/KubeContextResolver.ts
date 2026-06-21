import { Injectable } from "@di/index";
import { EnvironmentRepository } from "@repository/EnvironmentRepository";
import { ClusterRepository } from "@repository/ClusterRepository";
import { withTransaction } from "@database/withTransaction";
import { decrypt } from "@functions/crypto";
import { HttpError } from "@functions/HttpError";
import type { KubeContext } from "@interface/integrations";

/**
 * Resolve o KubeContext (kubeconfig decifrado + namespace) de um ambiente.
 * Se o ambiente não tiver cluster, retorna kubeconfig vazio → adapter opera
 * em modo dry-run (a plataforma funciona mesmo sem cluster registrado).
 */
@Injectable()
export class KubeContextResolver {
  constructor(
    private readonly environments: EnvironmentRepository,
    private readonly clusters: ClusterRepository,
  ) {}

  async forEnvironment(environmentId: string, tenant: { organizationId: string }): Promise<KubeContext> {
    return withTransaction(async () => {
      const env = await this.environments.findById(environmentId);
      if (!env) throw HttpError.notFound("Ambiente não encontrado.");

      if (!env.clusterId) return { kubeconfig: "", namespace: env.namespace };

      const cluster = await this.clusters.findById(env.clusterId);
      if (!cluster?.kubeconfigCipher) return { kubeconfig: "", namespace: env.namespace };

      return {
        kubeconfig: decrypt(cluster.kubeconfigCipher),
        namespace: env.namespace,
        clusterName: cluster.name,
      };
    }, { tenant });
  }
}
