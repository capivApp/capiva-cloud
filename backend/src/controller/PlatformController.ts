import type { Request, Response } from "express";
import { Injectable } from "@di/index";
import { ReleaseTrackingService } from "@service/ReleaseTrackingService";
import { FleetService } from "@service/FleetService";
import { MonitoringService } from "@service/MonitoringService";
import { ClusterWorkloadsService } from "@service/ClusterWorkloadsService";
import { RequestsService } from "@service/RequestsService";
import { OverviewService } from "@service/OverviewService";
import { tenantOf } from "@functions/tenant";
import { HttpError } from "@functions/HttpError";

@Injectable()
export class PlatformController {
  constructor(
    private readonly releases: ReleaseTrackingService,
    private readonly fleet: FleetService,
    private readonly monitoring: MonitoringService,
    private readonly workloads: ClusterWorkloadsService,
    private readonly requests: RequestsService,
    private readonly overview: OverviewService,
  ) {}

  overviewView = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.overview.forOrganization(tenantOf(req).organizationId));
  };

  requestsView = async (req: Request, res: Response): Promise<void> => {
    res.json(
      await this.requests.list(tenantOf(req), {
        host: req.query.host as string | undefined,
        applicationId: req.query.applicationId as string | undefined,
      }),
    );
  };

  releaseSummary = async (req: Request, res: Response): Promise<void> => {
    const projectId = req.query.projectId as string;
    if (!projectId) throw HttpError.badRequest("projectId é obrigatório.");
    res.json(await this.releases.forProject(projectId, tenantOf(req)));
  };

  fleetView = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.fleet.forOrganization(tenantOf(req).organizationId));
  };

  monitoringView = async (req: Request, res: Response): Promise<void> => {
    const clusterId = req.query.clusterId as string;
    if (!clusterId) throw HttpError.badRequest("clusterId é obrigatório.");
    res.json(await this.monitoring.forCluster(tenantOf(req).organizationId, clusterId));
  };

  /** Todos os pods do cluster (nó/fase/portas), categorizados. */
  clusterPodsView = async (req: Request, res: Response): Promise<void> => {
    const clusterId = req.query.clusterId as string;
    if (!clusterId) throw HttpError.badRequest("clusterId é obrigatório.");
    res.json(await this.workloads.pods(tenantOf(req).organizationId, clusterId));
  };

  /** Todos os bancos do cluster (pods agrupados por recurso do operator). */
  clusterDatabasesView = async (req: Request, res: Response): Promise<void> => {
    const clusterId = req.query.clusterId as string;
    if (!clusterId) throw HttpError.badRequest("clusterId é obrigatório.");
    res.json(await this.workloads.databases(tenantOf(req).organizationId, clusterId));
  };
}
