import type { Request, Response } from "express";
import { Injectable } from "@di/index";
import { ReleaseTrackingService } from "@service/ReleaseTrackingService";
import { FleetService } from "@service/FleetService";
import { MonitoringService } from "@service/MonitoringService";
import { RequestsService } from "@service/RequestsService";
import { tenantOf } from "@functions/tenant";
import { HttpError } from "@functions/HttpError";

@Injectable()
export class PlatformController {
  constructor(
    private readonly releases: ReleaseTrackingService,
    private readonly fleet: FleetService,
    private readonly monitoring: MonitoringService,
    private readonly requests: RequestsService,
  ) {}

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
}
