import type { Request, Response } from "express";
import { Injectable } from "@di/index";
import { OrganizationService } from "@service/OrganizationService";
import { HttpError } from "@functions/HttpError";

@Injectable()
export class OrganizationController {
  constructor(private readonly orgs: OrganizationService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    if (!req.auth) throw HttpError.unauthorized();
    res.json(await this.orgs.listForUser(req.auth.sub));
  };

  create = async (req: Request, res: Response): Promise<void> => {
    if (!req.auth) throw HttpError.unauthorized();
    const name = (req.body?.name as string)?.trim();
    if (!name) throw HttpError.badRequest("Nome é obrigatório.");
    res.status(201).json(await this.orgs.create(req.auth.sub, name));
  };
}
