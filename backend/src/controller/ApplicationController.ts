import type { Request, Response } from "express";
import { Injectable } from "@di/index";
import { ApplicationService } from "@service/ApplicationService";
import { DeploymentService } from "@service/DeploymentService";
import { DependencyService } from "@service/DependencyService";
import { RolloutService } from "@service/RolloutService";
import { createApplicationSchema, updateStrategySchema, updateTagsSchema } from "@schemas/application.schema";
import { HttpError } from "@functions/HttpError";

function org(req: Request): { organizationId: string } {
  const organizationId = req.headers["x-organization-id"] as string;
  if (!organizationId) throw HttpError.badRequest("Organização não informada (x-organization-id).");
  return { organizationId };
}

@Injectable()
export class ApplicationController {
  constructor(
    private readonly apps: ApplicationService,
    private readonly deployments: DeploymentService,
    private readonly dependencies: DependencyService,
    private readonly rollouts: RolloutService,
  ) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const projectId = req.query.projectId as string;
    if (!projectId) throw HttpError.badRequest("projectId é obrigatório.");
    res.json(await this.apps.listByProject(projectId, org(req)));
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const dto = createApplicationSchema.parse(req.body);
    res.status(201).json(await this.apps.create(dto, org(req)));
  };

  get = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.apps.getById(String(req.params.id), org(req)));
  };

  listDeployments = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.deployments.listByApplication(String(req.params.id), org(req)));
  };

  deploy = async (req: Request, res: Response): Promise<void> => {
    const version = (req.body?.version as string) ?? `manual-${Date.now()}`;
    res.status(202).json(await this.deployments.trigger(String(req.params.id), version, org(req)));
  };

  listDependencies = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.dependencies.listForApplication(String(req.params.id), org(req)));
  };

  connectDependency = async (req: Request, res: Response): Promise<void> => {
    const targetId = req.body?.targetId as string;
    if (!targetId) throw HttpError.badRequest("targetId é obrigatório.");
    const mappings = req.body?.mappings as { key: string; form: string }[] | undefined;
    res.status(201).json(await this.dependencies.connect(String(req.params.id), targetId, mappings as any, org(req)));
  };

  disconnectDependency = async (req: Request, res: Response): Promise<void> => {
    await this.dependencies.disconnect(String(req.params.depId), org(req));
    res.status(204).end();
  };

  updateStrategy = async (req: Request, res: Response): Promise<void> => {
    const dto = updateStrategySchema.parse(req.body);
    res.json(await this.rollouts.updateStrategy(String(req.params.id), dto.strategy, dto.config, org(req)));
  };

  rollback = async (req: Request, res: Response): Promise<void> => {
    const deploymentId = req.body?.deploymentId as string;
    if (!deploymentId) throw HttpError.badRequest("deploymentId é obrigatório.");
    res.status(202).json(await this.deployments.rollbackTo(String(req.params.id), deploymentId, org(req)));
  };

  promote = async (req: Request, res: Response): Promise<void> => {
    await this.rollouts.promote(String(req.params.id), org(req));
    res.status(202).json({ ok: true });
  };

  stop = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.apps.stop(String(req.params.id), org(req)));
  };

  start = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.apps.start(String(req.params.id), org(req)));
  };

  restart = async (req: Request, res: Response): Promise<void> => {
    await this.apps.restart(String(req.params.id), org(req));
    res.status(202).json({ ok: true });
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    await this.apps.remove(String(req.params.id), org(req));
    res.status(204).end();
  };

  updateTags = async (req: Request, res: Response): Promise<void> => {
    const { tags } = updateTagsSchema.parse(req.body);
    res.json(await this.apps.updateTags(String(req.params.id), tags, org(req)));
  };
}
