import { Injectable } from "@di/index";
import { ClusterRepository } from "@repository/ClusterRepository";
import { EnvironmentRepository } from "@repository/EnvironmentRepository";
import { KubernetesAdapter } from "@infra/kubernetes/KubernetesAdapter";
import { withTransaction } from "@database/withTransaction";
import { decrypt } from "@functions/crypto";

import type { NodeUsage } from "@interface/integrations";

export interface FleetCluster {
  id: string;
  name: string;
  region: string | null;
  status: string;
  version?: string;
  environments: number;
  nodes: NodeUsage[];
  nodeCount: number;
}

export interface FleetView {
  totalClusters: number;
  connected: number;
  totalEnvironments: number;
  clusters: FleetCluster[];
}

/**
 * Visão de frota (multi-cluster): agrega clusters da organização, status de
 * conectividade e quantos ambientes cada um hospeda.
 */
@Injectable()
export class FleetService {
  constructor(
    private readonly clusters: ClusterRepository,
    private readonly environments: EnvironmentRepository,
    private readonly k8s: KubernetesAdapter,
  ) {}

  async forOrganization(organizationId: string): Promise<FleetView> {
    const { clusters, environments } = await withTransaction(
      async () => ({
        clusters: await this.clusters.listByOrganization(organizationId),
        environments: await this.environments.listByOrganization(organizationId),
      }),
      { tenant: { organizationId } },
    );

    const envByCluster = new Map<string, number>();
    for (const env of environments) {
      if (env.clusterId) envByCluster.set(env.clusterId, (envByCluster.get(env.clusterId) ?? 0) + 1);
    }

    const result: FleetCluster[] = await Promise.all(
      clusters.map(async (c) => {
        const kubeconfig = c.kubeconfigCipher ? safeDecrypt(c.kubeconfigCipher) : "";
        const probe = kubeconfig ? await this.k8s.testConnection(kubeconfig) : { ok: false, version: undefined };
        const nodes = probe.ok ? await this.k8s.listNodes(kubeconfig) : [];
        return {
          id: c.id,
          name: c.name,
          region: c.region,
          status: probe.ok ? "connected" : "unreachable",
          version: probe.version,
          environments: envByCluster.get(c.id) ?? 0,
          nodes,
          nodeCount: nodes.length,
        };
      }),
    );

    return {
      totalClusters: result.length,
      connected: result.filter((c) => c.status === "connected").length,
      totalEnvironments: environments.length,
      clusters: result,
    };
  }
}

function safeDecrypt(value: string): string {
  try {
    return decrypt(value);
  } catch {
    return "";
  }
}
