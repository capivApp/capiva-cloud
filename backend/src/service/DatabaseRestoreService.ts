import { Injectable } from "@di/index";
import { BackupRestoreRepository } from "@repository/BackupRestoreRepository";
import { BackupRepository } from "@repository/BackupRepository";
import { ManagedDatabaseRepository } from "@repository/ManagedDatabaseRepository";
import { EnvironmentRepository } from "@repository/EnvironmentRepository";
import { ManagedDatabaseService } from "@service/ManagedDatabaseService";
import { StorageProviderService } from "@service/StorageProviderService";
import { KubeContextResolver } from "@service/KubeContextResolver";
import { KubernetesAdapter } from "@infra/kubernetes/KubernetesAdapter";
import { genericSecretManifest } from "@infra/kubernetes/databaseManifests";
import {
  databaseRestoreJobManifest,
  interpretRestoreJob,
} from "@infra/kubernetes/restoreManifests";
import { createRestoreKindStrategy } from "@service/restore/restoreKind.strategy";
import { createRestoreModeStrategy } from "@service/restore/restoreMode.strategy";
import {
  buildDatabaseSecretData,
  databaseNameOf,
  databaseUserOf,
} from "@service/backup/databaseSecret";
import { withTransaction } from "@database/withTransaction";
import { HttpError } from "@functions/HttpError";
import type { RestoreBackupDTO } from "@schemas/restore.schema";
import type { Backup, BackupRestore, ManagedDatabase } from "@prisma-generated/client";

type Tenant = { organizationId: string };

/** Só o escopo `single` grava um objeto exato no S3; `all` grava um prefixo. */
const isRestorableObject = (destination: string | null): destination is string =>
  Boolean(destination?.endsWith(".sql.gz"));

const requireRestorableBackup = (
  backup: Backup | null,
  databaseId: string,
): Backup & { destination: string } => {
  if (!backup || backup.databaseId !== databaseId)
    throw HttpError.notFound("Backup não encontrado.");
  if (backup.status !== "completed")
    throw HttpError.badRequest("Só é possível restaurar backups concluídos.");
  if (!isRestorableObject(backup.destination)) {
    throw HttpError.badRequest(
      "Este backup reúne vários bancos e não pode ser restaurado. Use um backup deste banco.",
    );
  }
  return backup as Backup & { destination: string };
};

const isInFlight = (restore: BackupRestore) =>
  restore.status === "RUNNING" && Boolean(restore.jobName);

/**
 * Restore de backup de banco (dump lógico no S3 → Job psql/mysql no cluster).
 * Dois modos (Strategy): sobre o próprio banco ou num banco NOVO criado pelo
 * fluxo normal do ManagedDatabaseService. O andamento fica em `BackupRestore`
 * e é atualizado a partir do Job a cada leitura (polling do frontend).
 */
@Injectable()
export class DatabaseRestoreService {
  constructor(
    private readonly restores: BackupRestoreRepository,
    private readonly backups: BackupRepository,
    private readonly databases: ManagedDatabaseRepository,
    private readonly environments: EnvironmentRepository,
    private readonly managedDatabases: ManagedDatabaseService,
    private readonly storage: StorageProviderService,
    private readonly kube: KubeContextResolver,
    private readonly k8s: KubernetesAdapter,
  ) {}

  async requestRestore(
    databaseId: string,
    backupId: string,
    input: RestoreBackupDTO,
    tenant: Tenant,
    requestedBy?: string,
  ): Promise<BackupRestore> {
    const source = await this.requireDatabase(databaseId, tenant);
    const kind = createRestoreKindStrategy(source.kind);
    const mode = createRestoreModeStrategy(input.mode);
    const backup = requireRestorableBackup(
      await withTransaction(() => this.backups.findById(backupId), { tenant }),
      databaseId,
    );
    mode.validate(input, source);

    const target = await mode.resolveTarget(source, input, (db, newName) =>
      this.createCopyOf(db, newName, tenant),
    );
    const restore = await withTransaction(
      () =>
        this.restores.create({
          organizationId: tenant.organizationId,
          backupId,
          kind: "DATABASE",
          mode: mode.mode,
          status: "PENDING",
          sourceDatabaseId: source.id,
          targetDatabaseId: target.id,
          targetName: target.name,
          requestedBy: requestedBy ?? null,
        }),
      { tenant },
    );

    const command = kind.command({ resetTarget: mode.resetTarget });
    return this.launchJob(restore, target, backup, command, tenant);
  }

  /** Restores pedidos a partir dos backups do banco, com o andamento atualizado. */
  async list(databaseId: string, tenant: Tenant): Promise<BackupRestore[]> {
    await this.requireDatabase(databaseId, tenant);
    const restores = await withTransaction(() => this.restores.listByDatabase(databaseId), {
      tenant,
    });
    return Promise.all(restores.map((restore) => this.refreshSafely(restore, tenant)));
  }

  async getById(databaseId: string, restoreId: string, tenant: Tenant): Promise<BackupRestore> {
    const restore = await withTransaction(() => this.restores.findById(restoreId), { tenant });
    if (!restore || restore.sourceDatabaseId !== databaseId)
      throw HttpError.notFound("Restore não encontrado.");
    return this.refreshSafely(restore, tenant);
  }

  /** Cluster fora do ar não derruba a leitura: devolve o último estado gravado. */
  private refreshSafely(restore: BackupRestore, tenant: Tenant): Promise<BackupRestore> {
    return this.refresh(restore, tenant).catch(() => restore);
  }

  private async requireDatabase(databaseId: string, tenant: Tenant): Promise<ManagedDatabase> {
    const db = await withTransaction(() => this.databases.findById(databaseId), { tenant });
    if (!db) throw HttpError.notFound("Banco não encontrado.");
    return db;
  }

  /** Banco novo pelo fluxo de criação, com o mesmo usuário e banco lógico (o dump referencia o owner). */
  async createCopyOf(
    source: ManagedDatabase,
    newName: string,
    tenant: Tenant,
  ): Promise<ManagedDatabase> {
    const existing = await withTransaction(
      () => this.databases.findByNameInEnvironment(source.environmentId, newName),
      { tenant },
    );
    if (existing) throw HttpError.conflict("Já existe um banco com esse nome neste ambiente.");
    return this.managedDatabases.create(
      {
        projectId: source.projectId,
        environmentId: source.environmentId,
        name: newName,
        kind: source.kind,
        size: source.size,
        highAvailability: source.highAvailability,
        username: databaseUserOf(source),
        database: databaseNameOf(source),
        backupEnabled: false,
      },
      tenant,
    );
  }

  /** Secret efêmero (credenciais do destino + S3) e o Job. Falha aqui = FAILED, sem derrubar a API. */
  private async launchJob(
    restore: BackupRestore,
    target: ManagedDatabase,
    backup: Backup & { destination: string },
    command: string,
    tenant: Tenant,
  ): Promise<BackupRestore> {
    const jobName = `${target.name}-restore-${restore.id.slice(-6)}`;
    try {
      const creds = await this.storage.resolveCredentials(
        tenant.organizationId,
        backup.storageProviderId ?? undefined,
      );
      const env = await withTransaction(() => this.environments.findById(target.environmentId), {
        tenant,
      });
      const namespace = env?.namespace ?? "default";
      const ctx = await this.kube.forEnvironment(target.environmentId, tenant);
      const secretData = buildDatabaseSecretData(target, namespace, creds, {
        OBJECT_KEY: backup.destination,
      });
      await this.k8s.apply(ctx, genericSecretManifest(jobName, namespace, secretData));
      await this.k8s.apply(
        ctx,
        databaseRestoreJobManifest({
          name: jobName,
          namespace,
          command,
          secretName: jobName,
          restoreId: restore.id,
        }),
      );
      return withTransaction(
        () => this.restores.update(restore.id, { status: "RUNNING", jobName, secretName: jobName }),
        { tenant },
      );
    } catch (error) {
      console.error("[db-restore] falhou ao iniciar:", (error as Error).message);
      return withTransaction(
        () =>
          this.restores.update(restore.id, {
            status: "FAILED",
            message: "Não foi possível iniciar o restore. Tente de novo.",
            finishedAt: new Date(),
          }),
        { tenant },
      );
    }
  }

  /** Lê o Job e grava o desfecho. Ao terminar, apaga o Secret efêmero (best-effort). */
  private async refresh(restore: BackupRestore, tenant: Tenant): Promise<BackupRestore> {
    if (!isInFlight(restore) || !restore.targetDatabaseId) return restore;
    const target = await withTransaction(
      () => this.databases.findById(restore.targetDatabaseId as string),
      { tenant },
    );
    if (!target) return restore;

    const ctx = await this.kube.forEnvironment(target.environmentId, tenant);
    const progress = interpretRestoreJob(
      await this.k8s.observe(ctx, "batch/v1", "Job", restore.jobName as string),
    );
    if (progress.status === "RUNNING") return restore;

    await this.k8s
      .remove(ctx, "v1", "Secret", restore.secretName ?? (restore.jobName as string))
      .catch(() => undefined);
    return withTransaction(
      () =>
        this.restores.update(restore.id, {
          status: progress.status,
          message: progress.message ?? null,
          finishedAt: new Date(),
        }),
      { tenant },
    );
  }
}
