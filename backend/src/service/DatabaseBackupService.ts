import { Injectable } from "@di/index";
import { BackupRepository } from "@repository/BackupRepository";
import { ManagedDatabaseRepository } from "@repository/ManagedDatabaseRepository";
import { EnvironmentRepository } from "@repository/EnvironmentRepository";
import { StorageProviderService } from "@service/StorageProviderService";
import { KubeContextResolver } from "@service/KubeContextResolver";
import { KubernetesAdapter } from "@infra/kubernetes/KubernetesAdapter";
import {
  CONNECTION_META,
  databaseBackupCommand,
  databaseBackupJobManifest,
  genericSecretManifest,
  type DbBackupKind,
  type DbBackupScope,
} from "@infra/kubernetes/databaseManifests";
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

/**
 * Backups de banco gerenciado: roda pg_dump/mysqldump num Job e envia para um
 * StorageProvider (S3). `scope=all` gera um arquivo por banco do servidor.
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

    const backup = await withTransaction(
      () =>
        this.backups.create({
          kind: "DATABASE",
          databaseId,
          storageProviderId: opts.storageProviderId ?? null,
          status: "running",
          destination: `${creds.endpoint}/${creds.bucket}/${db.name}`,
        }),
      { tenant },
    );

    try {
      const ctx = await this.kube.forEnvironment(db.environmentId, tenant);
      const secretName = `${db.name}-backup-${backup.id.slice(-6)}`;
      const secretData = this.buildSecretData(db, namespace, creds);
      const command = databaseBackupCommand(db.kind as DbBackupKind, scope, `${db.name}/${scope}`);
      await this.k8s.apply(ctx, genericSecretManifest(secretName, namespace, secretData));
      await this.k8s.apply(ctx, databaseBackupJobManifest(secretName, namespace, command, secretName));
      await withTransaction(() => this.backups.update(backup.id, { status: "completed", finishedAt: new Date() }), { tenant });
    } catch (error) {
      console.error("[db-backup] falhou:", (error as Error).message);
      await withTransaction(() => this.backups.update(backup.id, { status: "failed", finishedAt: new Date() }), { tenant });
    }

    return withTransaction(() => this.backups.findById(backup.id), { tenant }) as Promise<Backup>;
  }

  /** Variáveis de ambiente (Secret) com credenciais de origem (DB) e destino (S3). */
  private buildSecretData(db: ManagedDatabase, namespace: string, s3: { endpoint: string; bucket: string; accessKeyId: string; secretAccessKey: string }): Record<string, string> {
    const cfg = (db.config ?? {}) as { username?: string; passwordCipher?: string; database?: string };
    const username = cfg.username ?? "capiva";
    const password = cfg.passwordCipher ? safeDecrypt(cfg.passwordCipher) : "";
    const database = cfg.database ?? db.name.replace(/[^a-zA-Z0-9_]/g, "_");
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
        DB_NAME: database,
        SRC_URL: `${baseUrl}/${database}`,
        BASE_URL: baseUrl,
        ADMIN_URL: `${baseUrl}/postgres`,
      };
    }
    return { ...s3Env, DB_HOST: host, DB_USER: username, DB_PASS: password, DB_NAME: database };
  }
}

function safeDecrypt(value: string): string {
  try {
    return decrypt(value);
  } catch {
    return value;
  }
}
