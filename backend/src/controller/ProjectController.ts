import type { Request, Response } from "express";
import { Injectable } from "@di/index";
import { ProjectService } from "@service/ProjectService";
import { tenantOf } from "@functions/tenant";
import { HttpError } from "@functions/HttpError";

@Injectable()
export class ProjectController {
  constructor(private readonly projects: ProjectService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.projects.list(tenantOf(req).organizationId));
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const name = (req.body?.name as string)?.trim();
    if (!name) throw HttpError.badRequest("Nome é obrigatório.");
    res.status(201).json(await this.projects.create(tenantOf(req).organizationId, name));
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const name = (req.body?.name as string)?.trim();
    if (!name) throw HttpError.badRequest("Nome é obrigatório.");
    res.json(await this.projects.update(tenantOf(req).organizationId, String(req.params.id), name));
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    await this.projects.remove(tenantOf(req).organizationId, String(req.params.id));
    res.status(204).end();
  };
}
