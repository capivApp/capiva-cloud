import { Injectable } from "@di/index";
import { BaseRepository } from "@repository/BaseRepository";
import type { Prisma, ServiceDependency } from "@prisma-generated/client";

/**
 * Dependências entre aplicações. Como a aresta liga duas apps, o escopo de
 * organização é aplicado nas DUAS pontas — impede ligar (ou enxergar) um
 * serviço de outra organização no grafo.
 */
@Injectable()
export class ServiceDependencyRepository extends BaseRepository {
  /** Aresta visível apenas quando origem e destino são da organização ativa. */
  private get edgeScope(): Record<string, unknown> {
    const application = this.scope("application");
    return { source: { ...application }, target: { ...application } };
  }

  async create(data: Prisma.ServiceDependencyUncheckedCreateInput): Promise<ServiceDependency> {
    const application = this.scope("application");
    for (const id of [data.sourceId, data.targetId]) {
      await this.ensureScoped(
        () => this.tx.application.findFirst({ where: { id, ...application } }),
        "Aplicação",
      );
    }
    return this.tx.serviceDependency.create({ data });
  }

  listForApplication(applicationId: string): Promise<ServiceDependency[]> {
    return this.tx.serviceDependency.findMany({
      where: { OR: [{ sourceId: applicationId }, { targetId: applicationId }], ...this.edgeScope },
    });
  }

  listBySource(sourceId: string): Promise<ServiceDependency[]> {
    return this.tx.serviceDependency.findMany({ where: { sourceId, ...this.edgeScope } });
  }

  /** Ambientes (sem repetição) das apps de que a origem depende: onde a NetworkPolicy libera a origem. */
  async listTargetEnvironmentIds(sourceId: string): Promise<string[]> {
    const rows = await this.tx.serviceDependency.findMany({
      where: { sourceId, ...this.edgeScope },
      select: { target: { select: { environmentId: true } } },
    });
    return [...new Set(rows.map((row) => row.target.environmentId))];
  }

  /** Arestas que chegam em apps do ambiente, com o namespace de onde a origem vem. */
  listIncomingForEnvironment(environmentId: string) {
    const application = this.scope("application");
    return this.tx.serviceDependency.findMany({
      where: { source: { ...application }, target: { ...application, environmentId } },
      select: {
        source: { select: { name: true, environment: { select: { namespace: true } } } },
        target: { select: { name: true } },
      },
    });
  }

  find(sourceId: string, targetId: string): Promise<ServiceDependency | null> {
    return this.tx.serviceDependency.findFirst({ where: { sourceId, targetId, ...this.edgeScope } });
  }

  async delete(id: string): Promise<ServiceDependency> {
    await this.ensureScoped(
      () => this.tx.serviceDependency.findFirst({ where: { id, ...this.edgeScope } }),
      "Dependência",
    );
    return this.tx.serviceDependency.delete({ where: { id } });
  }
}
