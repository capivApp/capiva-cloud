import { Injectable } from "@di/index";
import { BackupRepository } from "@repository/BackupRepository";
import { ManagedDatabaseRepository } from "@repository/ManagedDatabaseRepository";
import { EnvironmentRepository } from "@repository/EnvironmentRepository";
import { StorageProviderService } from "@service/StorageProviderService";
import { KubeContextResolver } from "@service/KubeContextResolver";
import { readBackupConfig } from "@service/ManagedDatabaseService";
import { KubernetesAdapter } from "@infra/kubernetes/KubernetesAdapter";
import {
  CONNECTION_META,
  databaseBackupCommand,
  databaseBackupJobManifest,
  databaseRestoreCommand,
  databaseRetentionCommand,
  genericSecretManifest,
  type DbBackupKind,
  type DbBackupScope,
} from "@infra/kubernetes/databaseManifests";
import { cronMatches } from "@infra/scheduler/cron";
import { withTransaction } from "@database/withTransaction";
import { decrypt } from "@functions/crypto";
import { HttpError } from "@functions/HttpError";
import type { Backup, ManagedDatabase } from "@prisma-generated/client";

export interface DatabaseBackupOptions {
  scope?: DbBackupScope; // single (este banco) | all (cada banco do servidor → 1 arquivo cada)
  mode?: "full" | "incremental"; // incremental tratado como full até WAL archiving (documentado)
  storageProviderId?: string;
}

const DUMP_KINDS = new Set(["POSTGRESQL", "MYSQL"]);

type S3Creds = { endpoint: string; bucket: string; accessKeyId: string; secretAccessKey: string };

/**
 * Backups de banco gerenciado: roda pg_dump/mysqldump num Job e envia para um
 * StorageProvider (S3). `scope=all` gera um arquivo por banco do servidor.
 *
 * O carimbo (stamp) é gerado no backend e passado ao Job (BACKUP_STAMP), tornando
 * o objeto no S3 conhecido/registrado — o que habilita o restore por backup.
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

  async create(databaseId: string, tenant: { organizationId: string }, opts: DatabaseBackupOptions = {}): Promise<Backup> {
    const db = await withTransaction(() => this.databases.findById(databaseId), { tenant });
    if (!db) throw HttpError.notFound("Banco não encontrado.");
    if (!DUMP_KINDS.has(db.kind)) throw HttpError.badRequest("Backup por dump suporta apenas PostgreSQL e MySQL.");

    const creds = await this.storage.resolveCredentials(tenant.organizationId, opts.storageProviderId);
    const env = await withTransaction(() => this.environments.findById(db.environmentId), { tenant });
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
      const secretData = this.buildSecretData(db, namespace, creds, { BACKUP_STAMP: stamp });
      const command = databaseBackupCommand(db.kind as DbBackupKind, scope, prefix);
      await this.k8s.apply(ctx, genericSecretManifest(secretName, namespace, secretData));
      await this.k8s.apply(ctx, databaseBackupJobManifest(secretName, namespace, command, secretName));
      await withTransaction(() => this.backups.update(backup.id, { status: "completed", finishedAt: new Date() }), { tenant });
    } catch (error) {
      console.error("[db-backup] falhou:", (error as Error).message);
      await withTransaction(() => this.backups.update(backup.id, { status: "failed", finishedAt: new Date() }), { tenant });
    }

    return withTransaction(() => this.backups.findById(backup.id), { tenant }) as Promise<Backup>;
  }

  /**
   * Restaura um backup `single` concluído: baixa o dump do S3 e reaplica no banco
   * (operação destrutiva). Dispara um Job e retorna o backup de origem.
   */
  async restore(databaseId: string, backupId: string, tenant: { organizationId: string }): Promise<Backup> {
    const db = await withTransaction(() => this.databases.findById(databaseId), { tenant });
    if (!db) throw HttpError.notFound("Banco não encontrado.");
    if (!DUMP_KINDS.has(db.kind)) throw HttpError.badRequest("Restore por dump suporta apenas PostgreSQL e MySQL.");

    const backup = await withTransaction(() => this.backups.findById(backupId), { tenant });
    if (!backup || backup.databaseId !== databaseId) throw HttpError.notFound("Backup não encontrado.");
    if (backup.status !== "completed") throw HttpError.badRequest("Só é possível restaurar backups concluídos.");
    const objectKey = backup.destination;
    if (!objectKey || !objectKey.endsWith(".sql.gz")) {
      throw HttpError.badRequest("Backup sem objeto restaurável (restore disponível apenas para backups de escopo 'single').");
    }

    const creds = await this.storage.resolveCredentials(tenant.organizationId, backup.storageProviderId ?? undefined);
    const env = await withTransaction(() => this.environments.findById(db.environmentId), { tenant });
    const namespace = env?.namespace ?? "default";

    const ctx = await this.kube.forEnvironment(db.environmentId, tenant);
    const secretName = `${db.name}-restore-${backup.id.slice(-6)}`;
    const secretData = this.buildSecretData(db, namespace, creds, { OBJECT_KEY: objectKey });
    const command = databaseRestoreCommand(db.kind as DbBackupKind);
    await this.k8s.apply(ctx, genericSecretManifest(secretName, namespace, secretData));
    await this.k8s.apply(ctx, databaseBackupJobManifest(secretName, namespace, command, secretName));
    return backup;
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
      const latest = await withTransaction(() => this.backups.latestForDatabase(db.id), { tenant }).catch(() => null);
      if (latest && sameMinute(latest.startedAt, now)) continue; // dedupe no mesmo minuto

      await this.create(db.id, tenant, { scope: "single" }).catch((e) => console.error("[db-backup] agendado:", (e as Error).message));
      await this.applyRetention(db, tenant, backupCfg.retentionDays).catch((e) => console.error("[db-backup] retenção:", (e as Error).message));
      triggered++;
    }

    return triggered;
  }

  /** Retenção: apaga registros antigos e dispara um Job para limpar o S3 (best-effort). */
  private async applyRetention(db: ManagedDatabase, tenant: { organizationId: string }, retentionDays: number): Promise<void> {
    const before = new Date(Date.now() - retentionDays * 86_400_000);
    await withTransaction(() => this.backups.deleteOlderThan(db.id, before), { tenant });

    const creds = await this.storage.resolveCredentials(tenant.organizationId).catch(() => null);
    if (!creds) return;
    const env = await withTransaction(() => this.environments.findById(db.environmentId), { tenant });
    const namespace = env?.namespace ?? "default";
    const ctx = await this.kube.forEnvironment(db.environmentId, tenant);
    const secretName = `${db.name}-retention-${Date.now().toString(36).slice(-6)}`;
    const secretData: Record<string, string> = {
      S3_ENDPOINT: creds.endpoint,
      S3_BUCKET: creds.bucket,
      AWS_ACCESS_KEY_ID: creds.accessKeyId,
      AWS_SECRET_ACCESS_KEY: creds.secretAccessKey,
    };
    await this.k8s.apply(ctx, genericSecretManifest(secretName, namespace, secretData));
    await this.k8s.apply(ctx, databaseBackupJobManifest(secretName, namespace, databaseRetentionCommand(db.name, retentionDays), secretName));
  }

  /** Variáveis de ambiente (Secret) com credenciais de origem (DB) e destino (S3). */
  private buildSecretData(db: ManagedDatabase, namespace: string, s3: S3Creds, extra: Record<string, string> = {}): Record<string, string> {
    const cfg = (db.config ?? {}) as { username?: string; passwordCipher?: string; database?: string };
    const username = cfg.username ?? "capiva";
    const password = cfg.passwordCipher ? safeDecrypt(cfg.passwordCipher) : "";
    const database = databaseNameOf(db);
    const meta = CONNECTION_META[db.kind] ?? CONNECTION_META.POSTGRESQL;
    const host = `${meta.host(db.name)}.${namespace}.svc.cluster.local`;
    const port = String(meta.port);

    const s3Env = {
      S3_ENDPOINT: s3.endpoint,
      S3_BUCKET: s3.bucket,
      AWS_ACCESS_KEY_ID: s3.accessKeyId,
      AWS_SECRET_ACCESS_KEY: s3.secretAccessKey,
    };

    if (db.kind === "POSTGRESQL") {
      const baseUrl = `postgresql://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}`;
      return {
        ...s3Env,
        ...extra,
        DB_NAME: database,
        SRC_URL: `${baseUrl}/${database}`,
        BASE_URL: baseUrl,
        ADMIN_URL: `${baseUrl}/postgres`,
      };
    }
    return { ...s3Env, ...extra, DB_HOST: host, DB_USER: username, DB_PASS: password, DB_NAME: database };
  }
}

/** Nome do banco lógico (config.database ou derivado do nome do recurso). */
function databaseNameOf(db: ManagedDatabase): string {
  const cfg = (db.config ?? {}) as { database?: string };
  return cfg.database ?? db.name.replace(/[^a-zA-Z0-9_]/g, "_");
}

/** Carimbo determinístico no formato do Job: YYYYMMDD-HHMMSS (UTC). */
function backupStamp(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

function sameMinute(a: Date, b: Date): boolean {
  return Math.floor(a.getTime() / 60_000) === Math.floor(b.getTime() / 60_000);
}

function safeDecrypt(value: string): string {
  try {
    return decrypt(value);
  } catch {
    return value;
  }
}
