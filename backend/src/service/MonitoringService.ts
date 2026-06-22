import { Injectable } from "@di/index";
import { ClusterRepository } from "@repository/ClusterRepository";
import { KubernetesAdapter } from "@infra/kubernetes/KubernetesAdapter";
import { withTransaction } from "@database/withTransaction";
import { decrypt } from "@functions/crypto";
import { HttpError } from "@functions/HttpError";
import type { NodeMetricUsage } from "@interface/integrations";

export interface ClusterMonitoring {
  clusterId: string;
  clusterName: string;
  nodes: NodeMetricUsage[];
  totals: { cpuUsedM: number; cpuCapacityM: number; memUsedMib: number; memCapacityMib: number; pods: number };
}

/**
 * Monitoring de cluster: agrega uso de CPU/memória por nó (usado vs capacidade)
 * e pods por nó com uso, via metrics-server (metrics.k8s.io). O kubeconfig é
 * decifrado a partir do cluster da organização.
 */
@Injectable()
export class MonitoringService {
  constructor(
    private readonly clusters: ClusterRepository,
    private readonly k8s: KubernetesAdapter,
  ) {}

  async forCluster(organizationId: string, clusterId: string): Promise<ClusterMonitoring> {
    const cluster = await withTransaction(() => this.clusters.findById(clusterId), { tenant: { organizationId } });
    if (!cluster || cluster.organizationId !== organizationId) throw HttpError.notFound("Cluster não encontrado.");

    const kubeconfig = cluster.kubeconfigCipher ? safeDecrypt(cluster.kubeconfigCipher) : "";
    const nodes = await this.k8s.topNodes(kubeconfig);

    const totals = nodes.reduce(
      (acc, n) => ({
        cpuUsedM: acc.cpuUsedM + n.cpuUsedM,
        cpuCapacityM: acc.cpuCapacityM + n.cpuCapacityM,
        memUsedMib: acc.memUsedMib + n.memUsedMib,
        memCapacityMib: acc.memCapacityMib + n.memCapacityMib,
        pods: acc.pods + n.pods.length,
      }),
      { cpuUsedM: 0, cpuCapacityM: 0, memUsedMib: 0, memCapacityMib: 0, pods: 0 },
    );

    return { clusterId: cluster.id, clusterName: cluster.name, nodes, totals };
  }
}

function safeDecrypt(value: string): string {
  try {
    return decrypt(value);
  } catch {
    return "";
  }
}
