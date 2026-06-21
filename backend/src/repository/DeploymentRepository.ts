import { Injectable } from "@di/index";
import { BaseRepository } from "@repository/BaseRepository";
import type { Prisma, Deployment, DeploymentEvent } from "@prisma-generated/client";

@Injectable()
export class DeploymentRepository extends BaseRepository {
  create(data: Prisma.DeploymentUncheckedCreateInput): Promise<Deployment> {
    return this.tx.deployment.create({ data });
  }

  findById(id: string): Promise<Deployment | null> {
    return this.tx.deployment.findUnique({ where: { id }, include: { events: true } });
  }

  listByApplication(applicationId: string): Promise<Deployment[]> {
    return this.tx.deployment.findMany({
      where: { applicationId },
      orderBy: { startedAt: "desc" },
      take: 50,
    });
  }

  update(id: string, data: Prisma.DeploymentUncheckedUpdateInput): Promise<Deployment> {
    return this.tx.deployment.update({ where: { id }, data });
  }

  /** Último deploy saudável (para rollback automático), excluindo um id. */
  lastHealthy(applicationId: string, excludeId?: string): Promise<Deployment | null> {
    return this.tx.deployment.findFirst({
      where: { applicationId, status: "HEALTHY", id: excludeId ? { not: excludeId } : undefined },
      orderBy: { startedAt: "desc" },
    });
  }

  addEvent(data: Prisma.DeploymentEventUncheckedCreateInput): Promise<DeploymentEvent> {
    return this.tx.deploymentEvent.create({ data });
  }
}
