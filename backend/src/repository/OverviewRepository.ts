import { Injectable } from "@di/index";
import { BaseRepository } from "@repository/BaseRepository";
import type { Deployment } from "@prisma-generated/client";

export interface OverviewCounts {
  projects: number;
  applications: number;
  databases: number;
  workers: number;
  environments: number;
}

/**
 * Agregações org-wide para a visão geral (dashboard). Faz contagens e listas
 * recentes via join por `project.organizationId` (Prisma só aqui, no repo).
 */
@Injectable()
export class OverviewRepository extends BaseRepository {
  async counts(organizationId: string): Promise<OverviewCounts> {
    const byProjectOrg = { project: { organizationId } };
    const [projects, applications, databases, workers, environments] = await Promise.all([
      this.tx.project.count({ where: { organizationId } }),
      this.tx.application.count({ where: byProjectOrg }),
      this.tx.managedDatabase.count({ where: byProjectOrg }),
      this.tx.worker.count({ where: byProjectOrg }),
      this.tx.environment.count({ where: { organizationId } }),
    ]);
    return { projects, applications, databases, workers, environments };
  }

  /** Contagem de aplicações por observedStatus (saúde da plataforma). */
  async applicationStatusCounts(organizationId: string): Promise<Record<string, number>> {
    const rows = await this.tx.application.groupBy({
      by: ["observedStatus"],
      where: { project: { organizationId } },
      _count: { _all: true },
    });
    return Object.fromEntries(rows.map((r) => [r.observedStatus, r._count._all]));
  }

  /** Deploys mais recentes da org (com o nome da aplicação). */
  recentDeployments(organizationId: string, limit: number): Promise<(Deployment & { application: { name: string } })[]> {
    return this.tx.deployment.findMany({
      where: { application: { project: { organizationId } } },
      orderBy: { startedAt: "desc" },
      take: limit,
      include: { application: { select: { name: true } } },
    });
  }
}
