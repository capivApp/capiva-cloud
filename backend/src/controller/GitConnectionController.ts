import type { Request, Response } from "express";
import { Injectable } from "@di/index";
import { GitConnectionService } from "@service/GitConnectionService";
import { createGitConnectionSchema } from "@schemas/resource.schema";
import { tenantOf } from "@functions/tenant";

@Injectable()
export class GitConnectionController {
  constructor(private readonly connections: GitConnectionService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const list = await this.connections.list(tenantOf(req).organizationId);
    res.json(list.map(({ accessTokenCipher, webhookSecret, ...rest }) => rest));
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const dto = createGitConnectionSchema.parse(req.body);
    const { accessTokenCipher, webhookSecret, ...rest } = await this.connections.create(
      tenantOf(req).organizationId,
      dto,
    );
    res.status(201).json(rest);
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const { accessTokenCipher, webhookSecret, ...rest } = await this.connections.update(tenantOf(req).organizationId, String(req.params.id), {
      accessToken: req.body?.accessToken,
      accountLogin: req.body?.accountLogin,
      baseUrl: req.body?.baseUrl,
    });
    res.json(rest);
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    await this.connections.remove(tenantOf(req).organizationId, String(req.params.id));
    res.status(204).end();
  };
}
