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
    return this.tx.cluster.findFirst({ where: { id, ...this.scope("cluster") } });
  }

  /**
   * Resolução pelo token de registro (callback público do nó k3s). NÃO é
   * escopada de propósito: o chamador é o próprio nó, que ainda não tem
   * organização — o token de uso único é a credencial.
   */
  findByRegistrationToken(token: string): Promise<Cluster | null> {
    return this.tx.cluster.findUnique({ where: { registrationToken: token } });
  }

  async updateStatus(id: string, status: string): Promise<Cluster> {
    await this.ensureScoped(() => this.findById(id), "Cluster");
    return this.tx.cluster.update({ where: { id }, data: { status } });
  }

  async update(id: string, data: Prisma.ClusterUncheckedUpdateInput): Promise<Cluster> {
    await this.ensureScoped(() => this.findById(id), "Cluster");
    return this.tx.cluster.update({ where: { id }, data });
  }

  /** Update do fluxo de auto-registro (sem tenant no contexto). Uso interno. */
  updateUnscoped(id: string, data: Prisma.ClusterUncheckedUpdateInput): Promise<Cluster> {
    return this.tx.cluster.update({ where: { id }, data });
  }

  async delete(id: string): Promise<Cluster> {
    await this.ensureScoped(() => this.findById(id), "Cluster");
    return this.tx.cluster.delete({ where: { id } });
  }
}
