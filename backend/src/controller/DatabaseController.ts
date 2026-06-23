import type { Request, Response } from "express";
import { Injectable } from "@di/index";
import { ManagedDatabaseService } from "@service/ManagedDatabaseService";
import { DatabaseBackupService } from "@service/DatabaseBackupService";
import { createDatabaseSchema, updateDatabaseSchema } from "@schemas/resource.schema";
import { tenantOf } from "@functions/tenant";
import { HttpError } from "@functions/HttpError";

@Injectable()
export class DatabaseController {
  constructor(
    private readonly databases: ManagedDatabaseService,
    private readonly backups: DatabaseBackupService,
  ) {}

  listBackups = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.backups.list(String(req.params.id), tenantOf(req)));
  };

  createBackup = async (req: Request, res: Response): Promise<void> => {
    const { scope, mode, storageProviderId } = req.body ?? {};
    res.status(201).json(await this.backups.create(String(req.params.id), tenantOf(req), { scope, mode, storageProviderId }));
  };

  restoreBackup = async (req: Request, res: Response): Promise<void> => {
    res.status(202).json(await this.backups.restore(String(req.params.id), String(req.params.backupId), tenantOf(req)));
  };

  list = async (req: Request, res: Response): Promise<void> => {
    const projectId = req.query.projectId as string;
    if (!projectId) throw HttpError.badRequest("projectId é obrigatório.");
    res.json(await this.databases.listByProject(projectId, tenantOf(req)));
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const dto = createDatabaseSchema.parse(req.body);
    res.status(201).json(await this.databases.create(dto, tenantOf(req)));
  };

  get = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.databases.getDetail(String(req.params.id), tenantOf(req)));
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const dto = updateDatabaseSchema.parse(req.body);
    res.json(await this.databases.update(String(req.params.id), dto, tenantOf(req)));
  };

  attach = async (req: Request, res: Response): Promise<void> => {
    const applicationId = req.body?.applicationId as string;
    if (!applicationId) throw HttpError.badRequest("applicationId é obrigatório.");
    await this.databases.attachToApplication(String(req.params.id), applicationId, tenantOf(req));
    res.status(204).end();
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    await this.databases.remove(String(req.params.id), tenantOf(req));
    res.status(204).end();
  };
}
