import type { Request, Response } from "express";
import { Injectable } from "@di/index";
import { ApplicationService } from "@service/ApplicationService";
import { DeploymentService } from "@service/DeploymentService";
import { DependencyService } from "@service/DependencyService";
import { RolloutService } from "@service/RolloutService";
import { VolumeBackupService } from "@service/VolumeBackupService";
import { AuditService } from "@service/AuditService";
import { UptimeService } from "@service/UptimeService";
import { ReportService } from "@service/ReportService";
import { createApplicationSchema, updateStrategySchema, updateTagsSchema, updateTlsSchema, volumeSchema } from "@schemas/application.schema";
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
    private readonly volumeBackups: VolumeBackupService,
    private readonly audit: AuditService,
    private readonly uptime: UptimeService,
    private readonly reports: ReportService,
  ) {}

  listUptimeChecks = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.uptime.listChecks(String(req.params.id), org(req)));
  };

  createUptimeCheck = async (req: Request, res: Response): Promise<void> => {
    const url = (req.body?.url as string)?.trim();
    if (!url) throw HttpError.badRequest("url é obrigatória.");
    res.status(201).json(await this.uptime.createCheck(String(req.params.id), { url, intervalSec: req.body?.intervalSec, enabled: req.body?.enabled }, org(req)));
  };

  removeUptimeCheck = async (req: Request, res: Response): Promise<void> => {
    await this.uptime.removeCheck(String(req.params.checkId), org(req));
    res.status(204).end();
  };

  runUptimeCheck = async (req: Request, res: Response): Promise<void> => {
    await this.uptime.runNow(String(req.params.checkId), org(req));
    res.json({ ok: true });
  };

  reportsView = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.reports.forApplication(String(req.params.id), org(req)));
  };

  list = async (req: Request, res: Response): Promise<void> => {
    const projectId = req.query.projectId as string;
    if (!projectId) throw HttpError.badRequest("projectId é obrigatório.");
    res.json(await this.apps.listByProject(projectId, org(req)));
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const dto = createApplicationSchema.parse(req.body);
    const app = await this.apps.create(dto, org(req));
    this.audit.fromRequest(req, "application.create", { targetType: "application", targetId: app.id, detail: app.name });
    res.status(201).json(app);
  };

  get = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.apps.getById(String(req.params.id), org(req)));
  };

  listDeployments = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.deployments.listByApplication(String(req.params.id), org(req)));
  };

  deploy = async (req: Request, res: Response): Promise<void> => {
    const version = (req.body?.version as string) ?? `manual-${Date.now()}`;
    this.audit.fromRequest(req, "application.deploy", { targetType: "application", targetId: String(req.params.id), detail: version });
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
    this.audit.fromRequest(req, "application.delete", { targetType: "application", targetId: String(req.params.id) });
    res.status(204).end();
  };

  updateTags = async (req: Request, res: Response): Promise<void> => {
    const { tags } = updateTagsSchema.parse(req.body);
    res.json(await this.apps.updateTags(String(req.params.id), tags, org(req)));
  };

  updateTls = async (req: Request, res: Response): Promise<void> => {
    const dto = updateTlsSchema.parse(req.body);
    res.json(await this.apps.updateTls(String(req.params.id), dto, org(req)));
  };

  listVolumes = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.apps.listVolumes(String(req.params.id), org(req)));
  };

  addVolume = async (req: Request, res: Response): Promise<void> => {
    const dto = volumeSchema.parse(req.body);
    res.status(201).json(await this.apps.addVolume(String(req.params.id), dto, org(req)));
  };

  listVolumeBackups = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.volumeBackups.list(String(req.params.id), String(req.params.volId), org(req)));
  };

  createVolumeBackup = async (req: Request, res: Response): Promise<void> => {
    const storageProviderId = req.body?.storageProviderId as string | undefined;
    res.status(201).json(await this.volumeBackups.create(String(req.params.id), String(req.params.volId), org(req), storageProviderId));
  };

  restoreVolumeBackup = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.volumeBackups.restore(String(req.params.id), String(req.params.volId), String(req.params.backupId), org(req)));
  };

  removeVolume = async (req: Request, res: Response): Promise<void> => {
    await this.apps.removeVolume(String(req.params.id), String(req.params.volId), org(req));
    res.status(204).end();
  };
}
