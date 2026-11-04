import { Injectable } from "@di/index";
import { BaseRepository } from "@repository/BaseRepository";
import type { Environment, Prisma } from "@prisma-generated/client";

@Injectable()
export class EnvironmentRepository extends BaseRepository {
  create(data: Prisma.EnvironmentUncheckedCreateInput): Promise<Environment> {
    return this.tx.environment.create({ data });
  }

  listByOrganization(organizationId: string): Promise<Environment[]> {
    return this.tx.environment.findMany({
      where: { organizationId },
      orderBy: { createdAt: "asc" },
    });
  }

  /** Busca restrita à organização ativa — o kubeconfig do cluster sai daqui. */
  findById(id: string): Promise<Environment | null> {
    return this.tx.environment.findFirst({
      where: { id, ...this.scope("environment") },
      include: { cluster: true },
    });
  }

  async update(id: string, data: Prisma.EnvironmentUncheckedUpdateInput): Promise<Environment> {
    await this.ensureScoped(() => this.findById(id), "Ambiente");
    return this.tx.environment.update({ where: { id }, data });
  }

  async delete(id: string): Promise<Environment> {
    await this.ensureScoped(() => this.findById(id), "Ambiente");
    return this.tx.environment.delete({ where: { id } });
  }
}
