import { Injectable } from "@di/index";
import { ClusterRepository } from "@repository/ClusterRepository";
import { ClusterNodeRepository } from "@repository/ClusterNodeRepository";
import { KubernetesAdapter } from "@infra/kubernetes/KubernetesAdapter";
import { SSHExecutor } from "@infra/ssh/SSHExecutor";
import { withTransaction } from "@database/withTransaction";
import { decrypt } from "@functions/crypto";
import { HttpError } from "@functions/HttpError";
import type { ClusterNode } from "@prisma-generated/client";

/**
 * Gestão de nós do cluster: listar, cordon/uncordon e remover (drain + delete +
 * uninstall via SSH quando aplicável). Adicionar nó usa o ClusterProvisionerService.
 */
@Injectable()
export class NodeManagementService {
  constructor(
    private readonly clusters: ClusterRepository,
    private readonly nodes: ClusterNodeRepository,
    private readonly k8s: KubernetesAdapter,
    private readonly ssh: SSHExecutor,
  ) {}

  listNodes(organizationId: string, clusterId: string): Promise<ClusterNode[]> {
    return withTransaction(() => this.nodes.listByCluster(clusterId), { tenant: { organizationId } });
  }

  private async kubeconfigOf(organizationId: string, clusterId: string): Promise<string> {
    const cluster = await withTransaction(() => this.clusters.findById(clusterId), { tenant: { organizationId } });
    if (!cluster || cluster.organizationId !== organizationId) throw HttpError.notFound("Cluster não encontrado.");
    if (!cluster.kubeconfigCipher) throw HttpError.badRequest("Cluster ainda não está pronto.");
    return decrypt(cluster.kubeconfigCipher);
  }

  /** Cordon/uncordon: impede/permite novos pods no nó. */
  async setSchedulable(organizationId: string, clusterId: string, nodeName: string, schedulable: boolean): Promise<void> {
    const kubeconfig = await this.kubeconfigOf(organizationId, clusterId);
    await this.k8s.setNodeSchedulable(kubeconfig, nodeName, schedulable);
  }

  /** Remove um nó: cordon → delete no cluster → uninstall via SSH → remove do banco. */
  async removeNode(organizationId: string, clusterId: string, nodeId: string): Promise<void> {
    const node = await withTransaction(() => this.nodes.findById(nodeId), { tenant: { organizationId } });
    if (!node || node.clusterId !== clusterId) throw HttpError.notFound("Nó não encontrado.");

    const kubeconfig = await this.kubeconfigOf(organizationId, clusterId);
    const k8sNodeName = node.internalIp ?? node.host;

    await withTransaction(() => this.nodes.updateStatus(nodeId, "draining"), { tenant: { organizationId } });
    await this.k8s.setNodeSchedulable(kubeconfig, k8sNodeName, false).catch(() => undefined);
    await this.k8s.deleteNode(kubeconfig, k8sNodeName).catch(() => undefined);

    // Uninstall k3s via SSH (se tivermos credenciais do nó).
    if (node.sshCredentialCipher && node.sshUser) {
      const creds = JSON.parse(decrypt(node.sshCredentialCipher)) as { privateKey?: string; password?: string };
      const uninstall = node.role === "CONTROL_PLANE" ? "k3s-uninstall.sh" : "k3s-agent-uninstall.sh";
      await this.ssh
        .run({ host: node.host, port: node.sshPort, username: node.sshUser, ...creds }, `sudo ${uninstall} || true`)
        .catch(() => undefined);
    }

    await withTransaction(() => this.nodes.delete(nodeId), { tenant: { organizationId } });
  }
}
