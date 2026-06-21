import { Injectable } from "@di/index";
import { BaseRepository } from "@repository/BaseRepository";
import type { Cluster, Prisma } from "@prisma-generated/client";

@Injectable()
export class ClusterRepository extends BaseRepository {
  create(data: Prisma.ClusterUncheckedCreateInput): Promise<Cluster> {
    return this.tx.cluster.create({ data });
  }

  listByOrganization(organizationId: string): Promise<Cluster[]> {
    return this.tx.cluster.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" } });
  }

  findById(id: string): Promise<Cluster | null> {
    return this.tx.cluster.findUnique({ where: { id } });
  }

  findByRegistrationToken(token: string): Promise<Cluster | null> {
    return this.tx.cluster.findUnique({ where: { registrationToken: token } });
  }

  updateStatus(id: string, status: string): Promise<Cluster> {
    return this.tx.cluster.update({ where: { id }, data: { status } });
  }

  update(id: string, data: Prisma.ClusterUncheckedUpdateInput): Promise<Cluster> {
    return this.tx.cluster.update({ where: { id }, data });
  }

  delete(id: string): Promise<Cluster> {
    return this.tx.cluster.delete({ where: { id } });
  }
}
