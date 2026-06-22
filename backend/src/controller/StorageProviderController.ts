import type { Request, Response } from "express";
import { Injectable } from "@di/index";
import { StorageProviderService } from "@service/StorageProviderService";
import { createStorageProviderSchema } from "@schemas/infra.schema";
import { tenantOf } from "@functions/tenant";

@Injectable()
export class StorageProviderController {
  constructor(private readonly providers: StorageProviderService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const list = await this.providers.list(tenantOf(req).organizationId);
    res.json(list.map(({ credentialsCipher, ...rest }) => rest));
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const dto = createStorageProviderSchema.parse(req.body);
    const { credentialsCipher, ...rest } = await this.providers.create(tenantOf(req).organizationId, dto);
    res.status(201).json(rest);
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    await this.providers.remove(tenantOf(req).organizationId, String(req.params.id));
    res.status(204).end();
  };
}
