import { Injectable } from "@di/index";
import { BaseRepository } from "@repository/BaseRepository";
import type { Prisma, ServiceDependency } from "@prisma-generated/client";

@Injectable()
export class ServiceDependencyRepository extends BaseRepository {
  create(data: Prisma.ServiceDependencyUncheckedCreateInput): Promise<ServiceDependency> {
    return this.tx.serviceDependency.create({ data });
  }

  listForApplication(applicationId: string): Promise<ServiceDependency[]> {
    return this.tx.serviceDependency.findMany({
      where: { OR: [{ sourceId: applicationId }, { targetId: applicationId }] },
    });
  }

  listBySource(sourceId: string): Promise<ServiceDependency[]> {
    return this.tx.serviceDependency.findMany({ where: { sourceId } });
  }

  find(sourceId: string, targetId: string): Promise<ServiceDependency | null> {
    return this.tx.serviceDependency.findUnique({ where: { sourceId_targetId: { sourceId, targetId } } });
  }

  delete(id: string): Promise<ServiceDependency> {
    return this.tx.serviceDependency.delete({ where: { id } });
  }
}
