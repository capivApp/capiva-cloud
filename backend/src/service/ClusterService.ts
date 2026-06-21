import { Injectable } from "@di/index";
import { ClusterRepository } from "@repository/ClusterRepository";
import { KubernetesAdapter } from "@infra/kubernetes/KubernetesAdapter";
import { withTransaction } from "@database/withTransaction";
import { encrypt } from "@functions/crypto";
import { buildKubeconfig } from "@functions/kubeconfig";
import { HttpError } from "@functions/HttpError";
import type { Cluster } from "@prisma-generated/client";

export interface CreateClusterInput {
  name: string;
  region?: string;
  apiUrl: string;
  token: string;
  caCert?: string;
}

/**
 * Clusters Kubernetes. O usuário informa campos estruturados (URL/token/CA) —
 * NUNCA um kubeconfig YAML. A plataforma monta o kubeconfig, testa a conexão e
 * o armazena cifrado em repouso.
 */
@Injectable()
export class ClusterService {
  constructor(
    private readonly clusters: ClusterRepository,
    private readonly k8s: KubernetesAdapter,
  ) {}

  list(organizationId: string): Promise<Cluster[]> {
    return withTransaction(() => this.clusters.listByOrganization(organizationId), {
      tenant: { organizationId },
    });
  }

  async create(organizationId: string, input: CreateClusterInput): Promise<Cluster> {
    const kubeconfig = buildKubeconfig(input.name, { apiUrl: input.apiUrl, token: input.token, caCert: input.caCert });
    const probe = await this.k8s.testConnection(kubeconfig);
    return withTransaction(
      () =>
        this.clusters.create({
          organizationId,
          name: input.name,
          region: input.region,
          kubeconfigCipher: encrypt(kubeconfig),
          status: probe.ok ? "connected" : "unreachable",
        }),
      { tenant: { organizationId } },
    );
  }

  async update(
    organizationId: string,
    id: string,
    input: { name?: string; region?: string; apiUrl?: string; token?: string; caCert?: string },
  ): Promise<Cluster> {
    const cluster = await withTransaction(() => this.clusters.findById(id), { tenant: { organizationId } });
    if (!cluster || cluster.organizationId !== organizationId) throw HttpError.notFound("Cluster não encontrado.");

    const data: { name?: string; region?: string; kubeconfigCipher?: string; status?: string } = {
      name: input.name,
      region: input.region,
    };
    // Reconfigura a conexão apenas se URL+token forem fornecidos juntos.
    if (input.apiUrl && input.token) {
      const kubeconfig = buildKubeconfig(input.name ?? cluster.name, { apiUrl: input.apiUrl, token: input.token, caCert: input.caCert });
      const probe = await this.k8s.testConnection(kubeconfig);
      data.kubeconfigCipher = encrypt(kubeconfig);
      data.status = probe.ok ? "connected" : "unreachable";
    }
    return withTransaction(() => this.clusters.update(id, data), { tenant: { organizationId } });
  }

  async remove(organizationId: string, id: string): Promise<void> {
    const cluster = await withTransaction(() => this.clusters.findById(id), { tenant: { organizationId } });
    if (!cluster || cluster.organizationId !== organizationId) throw HttpError.notFound("Cluster não encontrado.");
    await withTransaction(() => this.clusters.delete(id), { tenant: { organizationId } });
  }
}
