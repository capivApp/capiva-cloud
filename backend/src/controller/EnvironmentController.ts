import type { Request, Response } from "express";
import { Injectable } from "@di/index";
import { EnvironmentService } from "@service/EnvironmentService";
import { createEnvironmentSchema } from "@schemas/resource.schema";
import { tenantOf } from "@functions/tenant";

@Injectable()
export class EnvironmentController {
  constructor(private readonly environments: EnvironmentService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.environments.list(tenantOf(req).organizationId));
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const dto = createEnvironmentSchema.parse(req.body);
    res.status(201).json(await this.environments.create(tenantOf(req).organizationId, dto));
  };

  update = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.environments.update(tenantOf(req).organizationId, String(req.params.id), {
      name: req.body?.name,
      kind: req.body?.kind,
      clusterId: req.body?.clusterId,
    }));
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    await this.environments.remove(tenantOf(req).organizationId, String(req.params.id));
    res.status(204).end();
  };
}
