import { Injectable } from "@di/index";
import { ClusterRepository } from "@repository/ClusterRepository";
import { KubernetesAdapter } from "@infra/kubernetes/KubernetesAdapter";
import { PrometheusAdapter } from "@infra/observability/PrometheusAdapter";
import { withTransaction } from "@database/withTransaction";
import { decrypt } from "@functions/crypto";
import { HttpError } from "@functions/HttpError";
import type { NodeMetricUsage } from "@interface/integrations";

export interface ClusterMonitoring {
  clusterId: string;
  clusterName: string;
  nodes: NodeMetricUsage[];
  totals: {
    cpuUsedM: number;
    cpuCapacityM: number;
    memUsedMib: number;
    memCapacityMib: number;
    pods: number;
    /** Disco/rede agregados do cluster (via Prometheus; null se indisponível). */
    diskUsedPct: number | null;
    netRxBps: number | null;
    netTxBps: number | null;
  };
}

// PromQL (node_exporter). Disco da raiz e rede agregada (excluindo loopback/veth).
const DISK_USED_PCT = `100 * (1 - sum(node_filesystem_avail_bytes{mountpoint="/",fstype!~"tmpfs|overlay"}) / sum(node_filesystem_size_bytes{mountpoint="/",fstype!~"tmpfs|overlay"}))`;
const NET_RX_BPS = `sum(rate(node_network_receive_bytes_total{device!~"lo|veth.*|cni.*|flannel.*"}[5m]))`;
const NET_TX_BPS = `sum(rate(node_network_transmit_bytes_total{device!~"lo|veth.*|cni.*|flannel.*"}[5m]))`;

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
    private readonly prometheus: PrometheusAdapter,
  ) {}

  async forCluster(organizationId: string, clusterId: string): Promise<ClusterMonitoring> {
    const cluster = await withTransaction(() => this.clusters.findById(clusterId), { tenant: { organizationId } });
    if (!cluster || cluster.organizationId !== organizationId) throw HttpError.notFound("Cluster não encontrado.");

    const kubeconfig = cluster.kubeconfigCipher ? safeDecrypt(cluster.kubeconfigCipher) : "";
    const nodes = await this.k8s.topNodes(kubeconfig);

    const base = nodes.reduce(
      (acc, n) => ({
        cpuUsedM: acc.cpuUsedM + n.cpuUsedM,
        cpuCapacityM: acc.cpuCapacityM + n.cpuCapacityM,
        memUsedMib: acc.memUsedMib + n.memUsedMib,
        memCapacityMib: acc.memCapacityMib + n.memCapacityMib,
        pods: acc.pods + n.pods.length,
      }),
      { cpuUsedM: 0, cpuCapacityM: 0, memUsedMib: 0, memCapacityMib: 0, pods: 0 },
    );

    // Disco/rede via Prometheus (best-effort; null sem PROMETHEUS_URL).
    const [diskUsedPct, netRxBps, netTxBps] = await Promise.all([
      this.prometheus.instant(DISK_USED_PCT),
      this.prometheus.instant(NET_RX_BPS),
      this.prometheus.instant(NET_TX_BPS),
    ]);

    return {
      clusterId: cluster.id,
      clusterName: cluster.name,
      nodes,
      totals: { ...base, diskUsedPct, netRxBps, netTxBps },
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
