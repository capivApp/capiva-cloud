import { Injectable } from "@di/index";
import { BaseRepository } from "@repository/BaseRepository";
import type { Prisma, Deployment, DeploymentEvent } from "@prisma-generated/client";

@Injectable()
export class DeploymentRepository extends BaseRepository {
  async create(data: Prisma.DeploymentUncheckedCreateInput): Promise<Deployment> {
    await this.ensureScoped(
      () => this.tx.application.findFirst({ where: { id: data.applicationId, ...this.scope("application") } }),
      "Aplicação",
    );
    return this.tx.deployment.create({ data });
  }

  findById(id: string): Promise<Deployment | null> {
    return this.tx.deployment.findFirst({ where: { id, ...this.scope("deployment") }, include: { events: true } });
  }

  listByApplication(applicationId: string): Promise<Deployment[]> {
    return this.tx.deployment.findMany({
      where: { applicationId, ...this.scope("deployment") },
      orderBy: { startedAt: "desc" },
      take: 50,
    });
  }

  async update(id: string, data: Prisma.DeploymentUncheckedUpdateInput): Promise<Deployment> {
    await this.ensureScoped(() => this.findById(id), "Deploy");
    return this.tx.deployment.update({ where: { id }, data });
  }

  /** Último deploy saudável (para rollback automático), excluindo um id. */
  lastHealthy(applicationId: string, excludeId?: string): Promise<Deployment | null> {
    return this.tx.deployment.findFirst({
      where: {
        applicationId,
        status: "HEALTHY",
        id: excludeId ? { not: excludeId } : undefined,
        ...this.scope("deployment"),
      },
      orderBy: { startedAt: "desc" },
    });
  }

  addEvent(data: Prisma.DeploymentEventUncheckedCreateInput): Promise<DeploymentEvent> {
    return this.tx.deploymentEvent.create({ data });
  }
}
