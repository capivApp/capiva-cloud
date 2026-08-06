import { Injectable } from "@di/index";
import { BaseRepository } from "@repository/BaseRepository";
import type { ClusterNode, Prisma } from "@prisma-generated/client";

@Injectable()
export class ClusterNodeRepository extends BaseRepository {
  async create(data: Prisma.ClusterNodeUncheckedCreateInput): Promise<ClusterNode> {
    await this.ensureScoped(
      () => this.tx.cluster.findFirst({ where: { id: data.clusterId, ...this.scope("cluster") } }),
      "Cluster",
    );
    return this.tx.clusterNode.create({ data });
  }

  listByCluster(clusterId: string): Promise<ClusterNode[]> {
    return this.tx.clusterNode.findMany({
      where: { clusterId, ...this.scope("clusterNode") },
      orderBy: { createdAt: "asc" },
    });
  }

  /** Busca restrita à organização ativa — a credencial SSH do nó sai daqui. */
  findById(id: string): Promise<ClusterNode | null> {
    return this.tx.clusterNode.findFirst({ where: { id, ...this.scope("clusterNode") } });
  }

  async updateStatus(id: string, status: string, internalIp?: string): Promise<ClusterNode> {
    await this.ensureScoped(() => this.findById(id), "Nó");
    return this.tx.clusterNode.update({ where: { id }, data: { status, internalIp } });
  }

  async delete(id: string): Promise<ClusterNode> {
    await this.ensureScoped(() => this.findById(id), "Nó");
    return this.tx.clusterNode.delete({ where: { id } });
  }
}
