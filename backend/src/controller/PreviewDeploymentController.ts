import type { Request, Response } from "express";
import { Injectable } from "@di/index";
import { PreviewDeploymentService } from "@service/PreviewDeploymentService";
import { AuditService } from "@service/AuditService";
import { tenantOf } from "@functions/tenant";

/** Previews por PR de uma aplicação. A lista vem no GET /applications/:id. */
@Injectable()
export class PreviewDeploymentController {
  constructor(
    private readonly previews: PreviewDeploymentService,
    private readonly audit: AuditService,
  ) {}

  destroy = async (req: Request, res: Response): Promise<void> => {
    const applicationId = String(req.params.id);
    const previewId = String(req.params.previewId);
    await this.previews.destroyPreview(applicationId, previewId, tenantOf(req));
    this.audit.fromRequest(req, "application.preview.destroy", {
      targetType: "application",
      targetId: applicationId,
      detail: previewId,
    });
    res.status(204).end();
  };
}
