import type { Request, Response } from "express";
import { Injectable } from "@di/index";
import { ApiKeyService } from "@service/ApiKeyService";
import { AuditService } from "@service/AuditService";
import { createApiKeySchema } from "@schemas/apikey.schema";
import { tenantOf } from "@functions/tenant";

@Injectable()
export class ApiKeyController {
  constructor(
    private readonly keys: ApiKeyService,
    private readonly audit: AuditService,
  ) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const list = await this.keys.list(tenantOf(req).organizationId);
    res.json(list.map(({ keyHash, ...rest }) => rest));
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const dto = createApiKeySchema.parse(req.body);
    const { apiKey, secret } = await this.keys.create(tenantOf(req).organizationId, dto);
    const { keyHash, ...rest } = apiKey;
    this.audit.fromRequest(req, "apikey.create", { targetType: "api_key", targetId: rest.id, detail: rest.name });
    // `secret` é mostrado UMA vez (não é recuperável depois).
    res.status(201).json({ ...rest, secret });
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    await this.keys.revoke(tenantOf(req).organizationId, String(req.params.id));
    res.status(204).end();
  };
}
