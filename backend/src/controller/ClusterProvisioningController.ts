import type { Request, Response } from "express";
import { z } from "zod";
import { Injectable } from "@di/index";
import { ClusterProvisionerService } from "@service/ClusterProvisionerService";
import { NodeManagementService } from "@service/NodeManagementService";
import { tenantOf } from "@functions/tenant";
import { HttpError } from "@functions/HttpError";

const sshSchema = z.object({
  name: z.string().min(1),
  nodes: z
    .array(
      z.object({
        host: z.string().min(1),
        sshUser: z.string().min(1),
        sshPort: z.number().int().optional(),
        privateKey: z.string().optional(),
        password: z.string().optional(),
        role: z.enum(["CONTROL_PLANE", "WORKER"]),
      }),
    )
    .min(1),
});

@Injectable()
export class ClusterProvisioningController {
  constructor(
    private readonly provisioner: ClusterProvisionerService,
    private readonly nodes: NodeManagementService,
  ) {}

  copyPaste = async (req: Request, res: Response): Promise<void> => {
    const name = (req.body?.name as string)?.trim();
    if (!name) throw HttpError.badRequest("Nome é obrigatório.");
    const { cluster, serverScript } = await this.provisioner.createCopyPaste(tenantOf(req).organizationId, name);
    const { kubeconfigCipher, nodeTokenCipher, registrationToken, ...rest } = cluster;
    res.status(201).json({ cluster: rest, serverScript });
  };

  ssh = async (req: Request, res: Response): Promise<void> => {
    const dto = sshSchema.parse(req.body);
    const cluster = await this.provisioner.provisionViaSsh(tenantOf(req).organizationId, dto.name, dto.nodes);
    const { kubeconfigCipher, nodeTokenCipher, ...rest } = cluster;
    res.status(202).json(rest);
  };

  joinCommand = async (req: Request, res: Response): Promise<void> => {
    const role = (req.query.role as "CONTROL_PLANE" | "WORKER") ?? "WORKER";
    const command = await this.provisioner.joinCommand(tenantOf(req).organizationId, String(req.params.id), role);
    res.json({ command });
  };

  listNodes = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.nodes.listNodes(tenantOf(req).organizationId, String(req.params.id)));
  };

  cordon = async (req: Request, res: Response): Promise<void> => {
    const schedulable = req.body?.schedulable !== false;
    await this.nodes.setSchedulable(tenantOf(req).organizationId, String(req.params.id), String(req.params.node), schedulable);
    res.json({ ok: true });
  };

  removeNode = async (req: Request, res: Response): Promise<void> => {
    await this.nodes.removeNode(tenantOf(req).organizationId, String(req.params.id), String(req.params.nodeId));
    res.status(204).end();
  };
}
