import type { Request, Response } from "express";
import { Injectable } from "@di/index";
import { GitService } from "@service/GitService";
import { tenantOf } from "@functions/tenant";
import { HttpError } from "@functions/HttpError";

@Injectable()
export class GitController {
  constructor(private readonly git: GitService) {}

  repos = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.git.listRepos(String(req.params.id), tenantOf(req)));
  };

  branches = async (req: Request, res: Response): Promise<void> => {
    const repo = req.query.repo as string;
    if (!repo) throw HttpError.badRequest("repo é obrigatório.");
    res.json(await this.git.listBranches(String(req.params.id), repo, tenantOf(req)));
  };

  detect = async (req: Request, res: Response): Promise<void> => {
    const repo = req.query.repo as string;
    const branch = (req.query.branch as string) ?? "main";
    if (!repo) throw HttpError.badRequest("repo é obrigatório.");
    res.json(await this.git.detectStack(String(req.params.id), repo, branch, tenantOf(req)));
  };
}
