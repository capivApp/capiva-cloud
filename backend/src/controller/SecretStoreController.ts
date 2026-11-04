import type { Request, Response } from "express";
import { Injectable } from "@di/index";
import { SecretStoreService } from "@service/SecretStoreService";
import { createSecretStoreSchema } from "@schemas/secretStore.schema";
import { tenantOf } from "@functions/tenant";

@Injectable()
export class SecretStoreController {
  constructor(private readonly stores: SecretStoreService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.stores.list(tenantOf(req)));
  };

  get = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.stores.getById(String(req.params.id), tenantOf(req)));
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const dto = createSecretStoreSchema.parse(req.body);
    res.status(201).json(await this.stores.create(dto, tenantOf(req)));
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    await this.stores.remove(String(req.params.id), tenantOf(req));
    res.status(204).end();
  };
}
