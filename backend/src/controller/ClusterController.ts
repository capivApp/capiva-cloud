import type { Request, Response } from "express";
import { Injectable } from "@di/index";
import { ClusterService } from "@service/ClusterService";
import { AuditService } from "@service/AuditService";
import { createClusterSchema } from "@schemas/resource.schema";
import { tenantOf } from "@functions/tenant";

@Injectable()
export class ClusterController {
  constructor(
    private readonly clusters: ClusterService,
    private readonly audit: AuditService,
  ) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const list = await this.clusters.list(tenantOf(req).organizationId);
    // Nunca expõe o kubeconfig cifrado.
    res.json(list.map(({ kubeconfigCipher, ...rest }) => rest));
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const dto = createClusterSchema.parse(req.body);
    const { kubeconfigCipher, ...rest } = await this.clusters.create(tenantOf(req).organizationId, dto);
    this.audit.fromRequest(req, "cluster.create", { targetType: "cluster", targetId: rest.id, detail: rest.name });
    res.status(201).json(rest);
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const { kubeconfigCipher, ...rest } = await this.clusters.update(tenantOf(req).organizationId, String(req.params.id), {
      name: req.body?.name,
      region: req.body?.region,
      apiUrl: req.body?.apiUrl,
      token: req.body?.token,
      caCert: req.body?.caCert,
    });
    res.json(rest);
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    await this.clusters.remove(tenantOf(req).organizationId, String(req.params.id));
    this.audit.fromRequest(req, "cluster.delete", { targetType: "cluster", targetId: String(req.params.id) });
    res.status(204).end();
  };
}
