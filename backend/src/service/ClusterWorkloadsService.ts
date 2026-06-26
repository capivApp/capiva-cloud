import { Injectable } from "@di/index";
import { ClusterRepository } from "@repository/ClusterRepository";
import { KubernetesAdapter } from "@infra/kubernetes/KubernetesAdapter";
import { withTransaction } from "@database/withTransaction";
import { decrypt } from "@functions/crypto";
import { HttpError } from "@functions/HttpError";
import type { ClusterPod, PodPort } from "@interface/integrations";

export interface ClusterPodView {
  name: string;
  namespace: string;
  node: string;
  phase: string;
  ready: boolean;
  restarts: number;
  podIP: string | null;
  ports: PodPort[];
  /** "database" | "platform" (gerenciado pela Capiva) | "system" | "app". */
  category: PodCategory;
}

export interface DatabaseInstanceView {
  /** Nome do recurso/cluster do banco (ex.: nome do CNPG Cluster). */
  name: string;
  namespace: string;
  /** Tipo inferido pelo label do operator. */
  engine: string;
  /** Instâncias (pods) com nó, papel e fase. */
  instances: { pod: string; node: string; phase: string; ready: boolean; role: string; ports: PodPort[] }[];
}

export interface ClusterPodsView {
  clusterId: string;
  clusterName: string;
  total: number;
  pods: ClusterPodView[];
}

export interface ClusterDatabasesView {
  clusterId: string;
  clusterName: string;
  databases: DatabaseInstanceView[];
}

type PodCategory = "database" | "platform" | "system" | "app";

/**
 * Cada entrada mapeia o label que o operator estampa nos pods do banco para o
 * tipo do engine e como extrair o nome do recurso/papel. Strategy map: adicionar
 * um novo banco = adicionar uma linha aqui (sem if/else espalhado).
 */
const DB_OPERATORS: { engine: string; clusterLabel: string; roleLabel?: string }[] = [
  { engine: "POSTGRESQL", clusterLabel: "cnpg.io/cluster", roleLabel: "cnpg.io/instanceRole" },
  { engine: "MYSQL", clusterLabel: "mysql.oracle.com/cluster" },
  { engine: "REDIS", clusterLabel: "redisfailovers.databases.spotahome.com/name" },
  { engine: "RABBITMQ", clusterLabel: "app.kubernetes.io/component", roleLabel: "app.kubernetes.io/name" },
  { engine: "KAFKA", clusterLabel: "strimzi.io/cluster" },
  { engine: "ELASTICSEARCH", clusterLabel: "elasticsearch.k8s.elastic.co/cluster-name" },
  { engine: "CLICKHOUSE", clusterLabel: "clickhouse.altinity.com/chi" },
  { engine: "MINIO", clusterLabel: "v1.min.io/tenant" },
];

const SYSTEM_NAMESPACES = new Set(["kube-system", "kube-public", "kube-node-lease", "longhorn-system", "cert-manager", "cnpg-system"]);

function matchDatabase(labels: Record<string, string>): { engine: string; name: string; role: string } | null {
  for (const op of DB_OPERATORS) {
    const name = labels[op.clusterLabel];
    if (!name) continue;
    // RabbitMQ usa component=rabbitmq; evita falso-positivo de outros components.
    if (op.engine === "RABBITMQ" && name !== "rabbitmq") continue;
    const role = (op.roleLabel ? labels[op.roleLabel] : undefined) ?? "instance";
    return { engine: op.engine, name, role };
  }
  return null;
}

function categorize(pod: ClusterPod): PodCategory {
  if (matchDatabase(pod.labels)) return "database";
  if (SYSTEM_NAMESPACES.has(pod.namespace)) return "system";
  if (pod.labels["app.kubernetes.io/managed-by"] === "capiva" || pod.labels["app.kubernetes.io/part-of"] === "capiva") return "platform";
  return "app";
}

/**
 * Visão cluster-wide de cargas de trabalho: todos os pods (nó/fase/portas) e os
 * bancos (agrupando os pods por recurso do operator). O kubeconfig é decifrado a
 * partir do cluster da organização (multi-tenant).
 */
@Injectable()
export class ClusterWorkloadsService {
  constructor(
    private readonly clusters: ClusterRepository,
    private readonly k8s: KubernetesAdapter,
  ) {}

  private async kubeconfigOf(organizationId: string, clusterId: string): Promise<{ name: string; kubeconfig: string }> {
    const cluster = await withTransaction(() => this.clusters.findById(clusterId), { tenant: { organizationId } });
    if (!cluster || cluster.organizationId !== organizationId) throw HttpError.notFound("Cluster não encontrado.");
    return { name: cluster.name, kubeconfig: cluster.kubeconfigCipher ? safeDecrypt(cluster.kubeconfigCipher) : "" };
  }

  async pods(organizationId: string, clusterId: string): Promise<ClusterPodsView> {
    const { name, kubeconfig } = await this.kubeconfigOf(organizationId, clusterId);
    const raw = await this.k8s.listClusterPods(kubeconfig);
    const pods = raw
      .map((p) => ({ ...p, category: categorize(p) }))
      .sort((a, b) => a.namespace.localeCompare(b.namespace) || a.name.localeCompare(b.name));
    return { clusterId, clusterName: name, total: pods.length, pods };
  }

  async databases(organizationId: string, clusterId: string): Promise<ClusterDatabasesView> {
    const { name, kubeconfig } = await this.kubeconfigOf(organizationId, clusterId);
    const raw = await this.k8s.listClusterPods(kubeconfig);

    const byKey = new Map<string, DatabaseInstanceView>();
    for (const pod of raw) {
      const db = matchDatabase(pod.labels);
      if (!db) continue;
      const key = `${pod.namespace}/${db.engine}/${db.name}`;
      if (!byKey.has(key)) byKey.set(key, { name: db.name, namespace: pod.namespace, engine: db.engine, instances: [] });
      byKey.get(key)!.instances.push({
        pod: pod.name,
        node: pod.node,
        phase: pod.phase,
        ready: pod.ready,
        role: db.role,
        ports: pod.ports,
      });
    }

    return { clusterId, clusterName: name, databases: [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name)) };
  }
}

function safeDecrypt(value: string): string {
  try {
    return decrypt(value);
  } catch {
    return "";
  }
}
