import { Injectable } from "@di/index";
import { OverviewRepository, type OverviewCounts } from "@repository/OverviewRepository";
import { AuditService } from "@service/AuditService";
import { FleetService } from "@service/FleetService";
import { withTransaction } from "@database/withTransaction";
import type { AuditLog } from "@prisma-generated/client";

export interface RecentDeploy {
  id: string;
  application: string;
  version: string;
  status: string;
  startedAt: Date;
}

export interface PlatformOverview {
  counts: OverviewCounts;
  /** Saúde das aplicações por status observado (running/progressing/error/…). */
  health: Record<string, number>;
  cluster: { totalClusters: number; connected: number; totalNodes: number; totalEnvironments: number };
  recentDeploys: RecentDeploy[];
  recentAudits: Pick<AuditLog, "id" | "event" | "detail" | "at">[];
}

/**
 * Visão geral da organização (dashboard): contagens de recursos, saúde das apps,
 * uso de frota de clusters, deploys e auditorias recentes. Agrega outros services
 * (Fleet/Audit) e o OverviewRepository.
 */
@Injectable()
export class OverviewService {
  constructor(
    private readonly overview: OverviewRepository,
    private readonly fleet: FleetService,
    private readonly audit: AuditService,
  ) {}

  async forOrganization(organizationId: string): Promise<PlatformOverview> {
    const tenant = { organizationId };

    const [counts, health, recentDeployments] = await withTransaction(
      async () =>
        [
          await this.overview.counts(organizationId),
          await this.overview.applicationStatusCounts(organizationId),
          await this.overview.recentDeployments(organizationId, 8),
        ] as const,
      { tenant },
    );

    const fleet = await this.fleet.forOrganization(organizationId).catch(() => null);
    const audits = await this.audit.list(organizationId).catch(() => []);

    return {
      counts,
      health,
      cluster: {
        totalClusters: fleet?.totalClusters ?? 0,
        connected: fleet?.connected ?? 0,
        totalNodes: fleet?.clusters.reduce((sum, c) => sum + c.nodeCount, 0) ?? 0,
        totalEnvironments: fleet?.totalEnvironments ?? counts.environments,
      },
      recentDeploys: recentDeployments.map((d) => ({
        id: d.id,
        application: d.application.name,
        version: d.version,
        status: d.status,
        startedAt: d.startedAt,
      })),
      recentAudits: audits.slice(0, 8).map((a) => ({ id: a.id, event: a.event, detail: a.detail, at: a.at })),
    };
  }
}
