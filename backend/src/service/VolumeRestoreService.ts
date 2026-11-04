import { Injectable } from "@di/index";
import { BackupRestoreRepository } from "@repository/BackupRestoreRepository";
import { BackupRepository } from "@repository/BackupRepository";
import { VolumeRepository } from "@repository/VolumeRepository";
import { ApplicationRepository } from "@repository/ApplicationRepository";
import { KubeContextResolver } from "@service/KubeContextResolver";
import { longhornBackupNameOf, requireApplicationVolume } from "@service/VolumeBackupService";
import { KubernetesAdapter } from "@infra/kubernetes/KubernetesAdapter";
import {
  interpretLonghornRestore,
  longhornRestoreVolumeManifest,
  restoredPersistentVolumeManifest,
  restoredPvcManifest,
  type VolumeRestoreInput,
} from "@infra/kubernetes/restoreManifests";
import { withTransaction } from "@database/withTransaction";
import { HttpError } from "@functions/HttpError";
import type { KubeContext, ObservedStatus } from "@interface/integrations";
import type { Application, Backup, BackupRestore } from "@prisma-generated/client";

type Tenant = { organizationId: string };

const LONGHORN_API = "longhorn.io/v1beta2";
const longhornContext = (ctx: KubeContext): KubeContext => ({ ...ctx, namespace: "longhorn-system" });

/** URL do backup no backupTarget. Em dry-run (sem cluster) não há Longhorn para perguntar. */
const backupUrlOf = (observed: ObservedStatus, backupName: string): string =>
  observed.message === "dry-run" ? `dry-run://${backupName}` : String(observed.raw?.url ?? "");

const requireRestorableBackup = (backup: Backup | null, volumeId: string): Backup => {
  if (!backup || backup.volumeId !== volumeId) throw HttpError.notFound("Backup não encontrado.");
  if (backup.status !== "completed") throw HttpError.badRequest("Só é possível restaurar backups concluídos.");
  return backup;
};

class BackupUrlMissingError extends Error {}

/**
 * Restore de backup de volume (Longhorn): cria um volume NOVO a partir do backup
 * (Volume CR `fromBackup` + PV + PVC no namespace da aplicação). O volume em uso
 * não é tocado; trocar o volume da aplicação (com redeploy) fica para depois.
 */
@Injectable()
export class VolumeRestoreService {
  constructor(
    private readonly restores: BackupRestoreRepository,
    private readonly backups: BackupRepository,
    private readonly volumes: VolumeRepository,
    private readonly apps: ApplicationRepository,
    private readonly kube: KubeContextResolver,
    private readonly k8s: KubernetesAdapter,
  ) {}

  async requestRestore(applicationId: string, volumeId: string, backupId: string, tenant: Tenant, requestedBy?: string): Promise<BackupRestore> {
    const volume = await requireApplicationVolume(this.volumes, applicationId, volumeId, tenant);
    const app = await this.requireApp(applicationId, tenant);
    const backup = requireRestorableBackup(await withTransaction(() => this.backups.findById(backupId), { tenant }), volumeId);

    const restore = await withTransaction(
      () =>
        this.restores.create({
          organizationId: tenant.organizationId,
          backupId,
          kind: "VOLUME",
          mode: "AS_COPY",
          status: "PENDING",
          volumeId,
          requestedBy: requestedBy ?? null,
        }),
      { tenant },
    );
    const name = `${app.name}-${volume.name}-restore-${restore.id.slice(-6)}`;
    const input = { name, sizeGi: volume.sizeGi, accessMode: volume.accessMode, restoreId: restore.id };
    return this.launch(restore, app, longhornBackupNameOf(app.name, volume.name, backup.id), input, tenant);
  }

  /** Restores do volume com o andamento lido do Volume Longhorn. */
  async list(applicationId: string, volumeId: string, tenant: Tenant): Promise<BackupRestore[]> {
    await requireApplicationVolume(this.volumes, applicationId, volumeId, tenant);
    const app = await this.requireApp(applicationId, tenant);
    const restores = await withTransaction(() => this.restores.listByVolume(volumeId), { tenant });
    return Promise.all(restores.map((restore) => this.refresh(restore, app, tenant).catch(() => restore)));
  }

  private async requireApp(applicationId: string, tenant: Tenant): Promise<Application> {
    const app = await withTransaction(() => this.apps.findById(applicationId), { tenant });
    if (!app) throw HttpError.notFound("Aplicação não encontrada.");
    return app;
  }

  private async launch(
    restore: BackupRestore,
    app: Application,
    backupName: string,
    volume: Omit<VolumeRestoreInput, "namespace" | "backupUrl">,
    tenant: Tenant,
  ): Promise<BackupRestore> {
    try {
      const ctx = await this.kube.forEnvironment(app.environmentId, tenant);
      const backupUrl = backupUrlOf(await this.k8s.observe(longhornContext(ctx), LONGHORN_API, "Backup", backupName), backupName);
      if (!backupUrl) throw new BackupUrlMissingError();
      const input: VolumeRestoreInput = { ...volume, namespace: ctx.namespace, backupUrl };
      await this.k8s.apply(ctx, longhornRestoreVolumeManifest(input));
      await this.k8s.apply(ctx, restoredPersistentVolumeManifest(input));
      await this.k8s.apply(ctx, restoredPvcManifest(input));
      return withTransaction(() => this.restores.update(restore.id, { status: "RUNNING", jobName: input.name, targetName: input.name }), { tenant });
    } catch (error) {
      console.error("[volume-restore] falhou ao iniciar:", (error as Error).message);
      const message =
        error instanceof BackupUrlMissingError
          ? "O backup ainda não está disponível no Longhorn. Tente de novo em instantes."
          : "Não foi possível iniciar o restore. Tente de novo.";
      return withTransaction(() => this.restores.update(restore.id, { status: "FAILED", message, targetName: volume.name, finishedAt: new Date() }), { tenant });
    }
  }

  private async refresh(restore: BackupRestore, app: Application, tenant: Tenant): Promise<BackupRestore> {
    if (restore.status !== "RUNNING" || !restore.jobName) return restore;
    const ctx = await this.kube.forEnvironment(app.environmentId, tenant);
    const progress = interpretLonghornRestore(await this.k8s.observe(longhornContext(ctx), LONGHORN_API, "Volume", restore.jobName));
    if (progress.status === "RUNNING") return restore;
    return withTransaction(
      () => this.restores.update(restore.id, { status: progress.status, message: progress.message ?? null, finishedAt: new Date() }),
      { tenant },
    );
  }
}
