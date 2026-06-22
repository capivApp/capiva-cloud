import type { Request, Response } from "express";
import { Injectable } from "@di/index";
import { DockerRegistryService } from "@service/DockerRegistryService";
import { createDockerRegistrySchema } from "@schemas/infra.schema";
import { tenantOf } from "@functions/tenant";

@Injectable()
export class DockerRegistryController {
  constructor(private readonly registries: DockerRegistryService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const list = await this.registries.list(tenantOf(req).organizationId);
    res.json(list.map(({ passwordCipher, ...rest }) => rest));
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const dto = createDockerRegistrySchema.parse(req.body);
    const { passwordCipher, ...rest } = await this.registries.create(tenantOf(req).organizationId, dto);
    res.status(201).json(rest);
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    await this.registries.remove(tenantOf(req).organizationId, String(req.params.id));
    res.status(204).end();
  };
}
