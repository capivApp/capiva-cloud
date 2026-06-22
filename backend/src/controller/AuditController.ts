import type { Request, Response } from "express";
import { Injectable } from "@di/index";
import { AuditService } from "@service/AuditService";
import { tenantOf } from "@functions/tenant";

@Injectable()
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    res.json(
      await this.audit.list(tenantOf(req).organizationId, {
        event: req.query.event as string | undefined,
        userId: req.query.userId as string | undefined,
      }),
    );
  };
}
