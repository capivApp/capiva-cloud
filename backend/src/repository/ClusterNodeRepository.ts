import { Injectable } from "@di/index";
import { BaseRepository } from "@repository/BaseRepository";
import type { ClusterNode, Prisma } from "@prisma-generated/client";

@Injectable()
export class ClusterNodeRepository extends BaseRepository {
  create(data: Prisma.ClusterNodeUncheckedCreateInput): Promise<ClusterNode> {
    return this.tx.clusterNode.create({ data });
  }
  listByCluster(clusterId: string): Promise<ClusterNode[]> {
    return this.tx.clusterNode.findMany({ where: { clusterId }, orderBy: { createdAt: "asc" } });
  }
  findById(id: string): Promise<ClusterNode | null> {
    return this.tx.clusterNode.findUnique({ where: { id } });
  }
  updateStatus(id: string, status: string, internalIp?: string): Promise<ClusterNode> {
    return this.tx.clusterNode.update({ where: { id }, data: { status, internalIp } });
  }
  delete(id: string): Promise<ClusterNode> {
    return this.tx.clusterNode.delete({ where: { id } });
  }
}
