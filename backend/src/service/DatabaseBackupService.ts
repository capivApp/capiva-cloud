import { Injectable } from "@di/index";
import { BackupRepository } from "@repository/BackupRepository";
import { ManagedDatabaseRepository } from "@repository/ManagedDatabaseRepository";
import { EnvironmentRepository } from "@repository/EnvironmentRepository";
import { StorageProviderService } from "@service/StorageProviderService";
import { KubeContextResolver } from "@service/KubeContextResolver";
import { readBackupConfig } from "@service/ManagedDatabaseService";
import { KubernetesAdapter } from "@infra/kubernetes/KubernetesAdapter";
import {
  databaseBackupCommand,
  databaseBackupJobManifest,
  databaseRetentionCommand,
  genericSecretManifest,
  type DbBackupKind,
  type DbBackupScope,
} from "@infra/kubernetes/databaseManifests";
import { cronMatches } from "@infra/scheduler/cron";
import { withTransaction } from "@database/withTransaction";
import { buildDatabaseSecretData, databaseNameOf, s3EnvOf } from "@service/backup/databaseSecret";
import { HttpError } from "@functions/HttpError";
import type { Backup, ManagedDatabase } from "@prisma-generated/client";

export interface DatabaseBackupOptions {
  scope?: DbBackupScope; // single (este banco) | all (cada banco do servidor → 1 arquivo cada)
  mode?: "full" | "incremental"; // incremental tratado como full até WAL archiving (documentado)
  storageProviderId?: string;
}

const DUMP_KINDS = new Set(["POSTGRESQL", "MYSQL"]);

/**
 * Backups de banco gerenciado: roda pg_dump/mysqldump num Job e envia para um
 * StorageProvider (S3). `scope=all` gera um arquivo por banco do servidor.
 *
 * O carimbo (stamp) é gerado no backend e passado ao Job (BACKUP_STAMP), tornando
 * o objeto no S3 conhecido/registrado — o que habilita o restore por backup
 * (ver DatabaseRestoreService).
 * Backups agendados são disparados por `runScheduledBackups` (cron por banco),
 * com retenção aplicada após cada execução.
 */
@Injectable()
export class DatabaseBackupService {
  constructor(
    private readonly backups: BackupRepository,
    private readonly databases: ManagedDatabaseRepository,
    private readonly environments: EnvironmentRepository,
    private readonly storage: StorageProviderService,
    private readonly kube: KubeContextResolver,
    private readonly k8s: KubernetesAdapter,
  ) {}

  list(databaseId: string, tenant: { organizationId: string }): Promise<Backup[]> {
    return withTransaction(() => this.backups.listByDatabase(databaseId), { tenant });
  }

  async create(
    databaseId: string,
    tenant: { organizationId: string },
    opts: DatabaseBackupOptions = {},
  ): Promise<Backup> {
    const db = await withTransaction(() => this.databases.findById(databaseId), { tenant });
    if (!db) throw HttpError.notFound("Banco não encontrado.");
    if (!DUMP_KINDS.has(db.kind))
      throw HttpError.badRequest("Backup por dump suporta apenas PostgreSQL e MySQL.");

    const creds = await this.storage.resolveCredentials(
      tenant.organizationId,
      opts.storageProviderId,
    );
    const env = await withTransaction(() => this.environments.findById(db.environmentId), {
      tenant,
    });
    const namespace = env?.namespace ?? "default";
    const scope = opts.scope ?? "single";
    const stamp = backupStamp();
    // Para escopo `single`, conhecemos o objeto exato (restaurável); para `all`,
    // registramos apenas o prefixo (múltiplos objetos, restore não suportado).
    const prefix = `${db.name}/${scope}`;
    const destination =
      scope === "single" ? `${prefix}/${databaseNameOf(db)}-${stamp}.sql.gz` : prefix;

    const backup = await withTransaction(
      () =>
        this.backups.create({
          kind: "DATABASE",
          databaseId,
          storageProviderId: opts.storageProviderId ?? null,
          status: "running",
          destination,
        }),
      { tenant },
    );

    try {
      const ctx = await this.kube.forEnvironment(db.environmentId, tenant);
      const secretName = `${db.name}-backup-${backup.id.slice(-6)}`;
      const secretData = buildDatabaseSecretData(db, namespace, creds, { BACKUP_STAMP: stamp });
      const command = databaseBackupCommand(db.kind as DbBackupKind, scope, prefix);
      await this.k8s.apply(ctx, genericSecretManifest(secretName, namespace, secretData));
      await this.k8s.apply(
        ctx,
        databaseBackupJobManifest(secretName, namespace, command, secretName),
      );
      await withTransaction(
        () => this.backups.update(backup.id, { status: "completed", finishedAt: new Date() }),
        { tenant },
      );
    } catch (error) {
      console.error("[db-backup] falhou:", (error as Error).message);
      await withTransaction(
        () => this.backups.update(backup.id, { status: "failed", finishedAt: new Date() }),
        { tenant },
      );
    }

    return withTransaction(() => this.backups.findById(backup.id), { tenant }) as Promise<Backup>;
  }

  /**
   * Varre todos os bancos com backup habilitado e dispara os que estão "no horário"
   * conforme o cron, evitando duplicar no mesmo minuto. Aplica retenção em seguida.
   * Roda sem tenant (igual ao scheduler de uptime); resolve a org pelo projeto.
   */
  async runScheduledBackups(now: Date = new Date()): Promise<number> {
    const dbs = await withTransaction(() => this.databases.listAllWithOrg(), {}).catch(() => []);
    let triggered = 0;

    for (const db of dbs) {
      if (!DUMP_KINDS.has(db.kind)) continue;
      const backupCfg = readBackupConfig(db.config as Parameters<typeof readBackupConfig>[0]);
      if (!backupCfg.enabled) continue;

      let due = false;
      try {
        due = cronMatches(backupCfg.schedule, now);
      } catch {
        continue; // cron inválido → ignora (não derruba o scheduler)
      }
      if (!due) continue;

      const tenant = { organizationId: db.project.organizationId };
      const latest = await withTransaction(() => this.backups.latestForDatabase(db.id), {
        tenant,
      }).catch(() => null);
      if (latest && sameMinute(latest.startedAt, now)) continue; // dedupe no mesmo minuto

      await this.create(db.id, tenant, { scope: "single" }).catch((e) =>
        console.error("[db-backup] agendado:", (e as Error).message),
      );
      await this.applyRetention(db, tenant, backupCfg.retentionDays).catch((e) =>
        console.error("[db-backup] retenção:", (e as Error).message),
      );
      triggered++;
    }

    return triggered;
  }

  /** Retenção: apaga registros antigos e dispara um Job para limpar o S3 (best-effort). */
  private async applyRetention(
    db: ManagedDatabase,
    tenant: { organizationId: string },
    retentionDays: number,
  ): Promise<void> {
    const before = new Date(Date.now() - retentionDays * 86_400_000);
    await withTransaction(() => this.backups.deleteOlderThan(db.id, before), { tenant });

    const creds = await this.storage.resolveCredentials(tenant.organizationId).catch(() => null);
    if (!creds) return;
    const env = await withTransaction(() => this.environments.findById(db.environmentId), {
      tenant,
    });
    const namespace = env?.namespace ?? "default";
    const ctx = await this.kube.forEnvironment(db.environmentId, tenant);
    const secretName = `${db.name}-retention-${Date.now().toString(36).slice(-6)}`;
    await this.k8s.apply(ctx, genericSecretManifest(secretName, namespace, s3EnvOf(creds)));
    await this.k8s.apply(
      ctx,
      databaseBackupJobManifest(
        secretName,
        namespace,
        databaseRetentionCommand(db.name, retentionDays),
        secretName,
      ),
    );
  }
}

/** Carimbo determinístico no formato do Job: YYYYMMDD-HHMMSS (UTC). */
function backupStamp(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

function sameMinute(a: Date, b: Date): boolean {
  return Math.floor(a.getTime() / 60_000) === Math.floor(b.getTime() / 60_000);
}
