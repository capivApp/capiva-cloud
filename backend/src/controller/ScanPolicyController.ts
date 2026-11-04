import type { Request, Response } from "express";
import { Injectable } from "@di/index";
import { ImageScanService } from "@service/ImageScanService";
import { AuditService } from "@service/AuditService";
import { scanPolicySchema } from "@schemas/scan.schema";
import { tenantOf } from "@functions/tenant";

/** Política de scan de vulnerabilidades da aplicação (PUT /applications/:id/security). */
@Injectable()
export class ScanPolicyController {
  constructor(
    private readonly scans: ImageScanService,
    private readonly audit: AuditService,
  ) {}

  update = async (req: Request, res: Response): Promise<void> => {
    const policy = scanPolicySchema.parse(req.body);
    const app = await this.scans.savePolicy(String(req.params.id), policy, tenantOf(req));
    this.audit.fromRequest(req, "application.security.update", {
      targetType: "application",
      targetId: app.id,
      detail: `scan=${policy.scanEnabled} block=${policy.blockOnSeverity}`,
    });
    res.json(app);
  };
}
