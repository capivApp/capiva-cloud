import type { Request, Response } from "express";
import { Injectable } from "@di/index";
import { ReleaseTrackingService } from "@service/ReleaseTrackingService";
import { FleetService } from "@service/FleetService";
import { tenantOf } from "@functions/tenant";
import { HttpError } from "@functions/HttpError";

@Injectable()
export class PlatformController {
  constructor(
    private readonly releases: ReleaseTrackingService,
    private readonly fleet: FleetService,
  ) {}

  releaseSummary = async (req: Request, res: Response): Promise<void> => {
    const projectId = req.query.projectId as string;
    if (!projectId) throw HttpError.badRequest("projectId é obrigatório.");
    res.json(await this.releases.forProject(projectId, tenantOf(req)));
  };

  fleetView = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.fleet.forOrganization(tenantOf(req).organizationId));
  };
}
