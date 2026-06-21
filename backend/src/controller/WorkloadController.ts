import type { Request, Response } from "express";
import { Injectable } from "@di/index";
import { WorkerService } from "@service/WorkerService";
import { CronJobService } from "@service/CronJobService";
import { createCronJobSchema, createWorkerSchema } from "@schemas/workload.schema";
import { tenantOf } from "@functions/tenant";
import { HttpError } from "@functions/HttpError";

@Injectable()
export class WorkloadController {
  constructor(
    private readonly workers: WorkerService,
    private readonly cronJobs: CronJobService,
  ) {}

  listWorkers = async (req: Request, res: Response): Promise<void> => {
    const projectId = req.query.projectId as string;
    if (!projectId) throw HttpError.badRequest("projectId é obrigatório.");
    res.json(await this.workers.list(projectId, tenantOf(req)));
  };

  createWorker = async (req: Request, res: Response): Promise<void> => {
    const dto = createWorkerSchema.parse(req.body);
    res.status(201).json(await this.workers.create(dto, tenantOf(req)));
  };

  updateWorker = async (req: Request, res: Response): Promise<void> => {
    const environmentId = req.body?.environmentId as string;
    if (!environmentId) throw HttpError.badRequest("environmentId é obrigatório.");
    res.json(await this.workers.update(String(req.params.id), environmentId, {
      replicas: req.body?.replicas,
      image: req.body?.image,
      env: req.body?.env,
    }, tenantOf(req)));
  };

  listCronJobs = async (req: Request, res: Response): Promise<void> => {
    const projectId = req.query.projectId as string;
    if (!projectId) throw HttpError.badRequest("projectId é obrigatório.");
    res.json(await this.cronJobs.list(projectId, tenantOf(req)));
  };

  createCronJob = async (req: Request, res: Response): Promise<void> => {
    const dto = createCronJobSchema.parse(req.body);
    res.status(201).json(await this.cronJobs.create(dto, tenantOf(req)));
  };

  updateCronJob = async (req: Request, res: Response): Promise<void> => {
    const environmentId = req.body?.environmentId as string;
    if (!environmentId) throw HttpError.badRequest("environmentId é obrigatório.");
    res.json(await this.cronJobs.update(String(req.params.id), environmentId, {
      schedule: req.body?.schedule,
      image: req.body?.image,
      env: req.body?.env,
    }, tenantOf(req)));
  };
}
