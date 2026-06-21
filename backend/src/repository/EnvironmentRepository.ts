import { Injectable } from "@di/index";
import { BaseRepository } from "@repository/BaseRepository";
import type { Environment, Prisma } from "@prisma-generated/client";

@Injectable()
export class EnvironmentRepository extends BaseRepository {
  create(data: Prisma.EnvironmentUncheckedCreateInput): Promise<Environment> {
    return this.tx.environment.create({ data });
  }

  listByOrganization(organizationId: string): Promise<Environment[]> {
    return this.tx.environment.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" } });
  }

  findById(id: string): Promise<Environment | null> {
    return this.tx.environment.findUnique({ where: { id }, include: { cluster: true } });
  }

  update(id: string, data: Prisma.EnvironmentUncheckedUpdateInput): Promise<Environment> {
    return this.tx.environment.update({ where: { id }, data });
  }

  delete(id: string): Promise<Environment> {
    return this.tx.environment.delete({ where: { id } });
  }
}
