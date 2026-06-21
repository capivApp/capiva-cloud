import { Injectable } from "@di/index";
import { ApplicationRepository } from "@repository/ApplicationRepository";
import { DeploymentRepository } from "@repository/DeploymentRepository";
import { withTransaction } from "@database/withTransaction";

export interface ReleaseRow {
  id: string;
  applicationId: string;
  applicationName: string;
  version: string;
  status: string;
  durationSeconds: number | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface ReleaseSummary {
  totalDeploys: number;
  successRate: number;
  rollbacks: number;
  avgDeploySeconds: number | null;
  recent: ReleaseRow[];
}

/**
 * Rastreabilidade de releases: agrega deploys de um projeto e calcula tempos
 * médios (deploy) e taxa de sucesso. Base para auditoria e debugging.
 */
@Injectable()
export class ReleaseTrackingService {
  constructor(
    private readonly apps: ApplicationRepository,
    private readonly deployments: DeploymentRepository,
  ) {}

  async forProject(projectId: string, tenant: { organizationId: string }): Promise<ReleaseSummary> {
    return withTransaction(async () => {
      const apps = await this.apps.listByProject(projectId);
      const nameById = new Map(apps.map((a) => [a.id, a.name]));

      const all: ReleaseRow[] = [];
      for (const app of apps) {
        const deps = await this.deployments.listByApplication(app.id);
        for (const d of deps) {
          const duration =
            d.finishedAt && d.startedAt ? Math.round((d.finishedAt.getTime() - d.startedAt.getTime()) / 1000) : null;
          all.push({
            id: d.id,
            applicationId: d.applicationId,
            applicationName: nameById.get(d.applicationId) ?? "—",
            version: d.version,
            status: d.status,
            durationSeconds: duration,
            startedAt: d.startedAt.toISOString(),
            finishedAt: d.finishedAt?.toISOString() ?? null,
          });
        }
      }

      all.sort((a, b) => +new Date(b.startedAt) - +new Date(a.startedAt));
      const finished = all.filter((r) => r.durationSeconds != null);
      const healthy = all.filter((r) => r.status === "HEALTHY").length;
      const rollbacks = all.filter((r) => r.status === "ROLLED_BACK" || r.version.startsWith("rollback-")).length;
      const avg = finished.length ? Math.round(finished.reduce((s, r) => s + (r.durationSeconds ?? 0), 0) / finished.length) : null;

      return {
        totalDeploys: all.length,
        successRate: all.length ? Math.round((healthy / all.length) * 100) : 0,
        rollbacks,
        avgDeploySeconds: avg,
        recent: all.slice(0, 50),
      };
    }, { tenant });
  }
}
