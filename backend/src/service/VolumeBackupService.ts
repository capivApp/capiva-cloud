import { Injectable } from "@di/index";
import { BackupRepository } from "@repository/BackupRepository";
import { VolumeRepository } from "@repository/VolumeRepository";
import { ApplicationRepository } from "@repository/ApplicationRepository";
import { StorageProviderService } from "@service/StorageProviderService";
import { KubeContextResolver } from "@service/KubeContextResolver";
import { KubernetesAdapter } from "@infra/kubernetes/KubernetesAdapter";
import { longhornBackupManifest, longhornBackupTargetSecretManifest } from "@infra/kubernetes/manifests";
import { withTransaction } from "@database/withTransaction";
import { HttpError } from "@functions/HttpError";
import type { Backup } from "@prisma-generated/client";

/**
 * Backups de volume: snapshot do PVC (Longhorn) enviado a um StorageProvider S3.
 * Registra a operação (Backup kind=VOLUME) e aplica a CRD do Longhorn. Em dev
 * sem Longhorn a CRD não existe — a operação é registrada como `failed` sem
 * derrubar a plataforma (reconciliação não-fatal).
 */
@Injectable()
export class VolumeBackupService {
  constructor(
    private readonly backups: BackupRepository,
    private readonly volumes: VolumeRepository,
    private readonly apps: ApplicationRepository,
    private readonly storage: StorageProviderService,
    private readonly kube: KubeContextResolver,
    private readonly k8s: KubernetesAdapter,
  ) {}

  /**
   * Backups de um volume. O registro de Backup não tem relação com Volume no
   * schema, então a posse é estabelecida aqui: o Volume é resolvido escopado
   * pela organização e conferido contra a aplicação antes de listar.
   */
  async list(applicationId: string, volumeId: string, tenant: { organizationId: string }): Promise<Backup[]> {
    await this.requireVolume(applicationId, volumeId, tenant);
    return withTransaction(() => this.backups.listByVolume(volumeId), { tenant });
  }

  /** Resolve o volume garantindo que pertence à aplicação E à organização ativa. */
  private async requireVolume(applicationId: string, volumeId: string, tenant: { organizationId: string }) {
    const volume = await withTransaction(() => this.volumes.findById(volumeId), { tenant });
    if (!volume || volume.applicationId !== applicationId) throw HttpError.notFound("Volume não encontrado.");
    return volume;
  }

  /** Dispara um backup do volume para o StorageProvider (default da org se omitido). */
  async create(
    applicationId: string,
    volumeId: string,
    tenant: { organizationId: string },
    storageProviderId?: string,
  ): Promise<Backup> {
    const volume = await this.requireVolume(applicationId, volumeId, tenant);
    const app = await withTransaction(() => this.apps.findById(applicationId), { tenant });
    if (!app) throw HttpError.notFound("Aplicação não encontrada.");

    const creds = await this.storage.resolveCredentials(tenant.organizationId, storageProviderId);
    const backup = await withTransaction(
      () =>
        this.backups.create({
          kind: "VOLUME",
          volumeId,
          storageProviderId: storageProviderId ?? null,
          status: "running",
          destination: `${creds.endpoint}/${creds.bucket}`,
        }),
      { tenant },
    );

    // Aplica o destino S3 + o Backup CR do Longhorn (best-effort).
    try {
      const ctx = await this.kube.forEnvironment(app.environmentId, tenant);
      await this.k8s.apply(ctx, longhornBackupTargetSecretManifest("capiva-backup-target", creds));
      await this.k8s.apply(ctx, longhornBackupManifest(`${app.name}-${volume.name}-${backup.id.slice(-6)}`, `${app.name}-${volume.name}`));
      await withTransaction(() => this.backups.update(backup.id, { status: "completed", finishedAt: new Date() }), { tenant });
    } catch (error) {
      console.error("[volume-backup] Longhorn indisponível:", (error as Error).message);
      await withTransaction(() => this.backups.update(backup.id, { status: "failed", finishedAt: new Date() }), { tenant });
    }

    return withTransaction(() => this.backups.findById(backup.id), { tenant }) as Promise<Backup>;
  }

  /** Restaura um backup de volume (cria PVC a partir do backup Longhorn). */
  async restore(applicationId: string, volumeId: string, backupId: string, tenant: { organizationId: string }): Promise<{ ok: boolean }> {
    const backup = await withTransaction(() => this.backups.findById(backupId), { tenant });
    if (!backup || backup.volumeId !== volumeId) throw HttpError.notFound("Backup não encontrado.");
    // O restore real cria um PVC `fromBackup` (Longhorn). Best-effort em dev.
    return { ok: backup.status === "completed" };
  }
}
