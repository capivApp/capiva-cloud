import crypto from "crypto";
import { Injectable } from "@di/index";
import { ManagedDatabaseRepository } from "@repository/ManagedDatabaseRepository";
import { ApplicationRepository } from "@repository/ApplicationRepository";
import { EnvVarRepository } from "@repository/EnvVarRepository";
import { EnvironmentRepository } from "@repository/EnvironmentRepository";
import { ReconcilerFactory } from "@infra/kubernetes/ReconcilerFactory";
import { KubeContextResolver } from "@service/KubeContextResolver";
import { withTransaction } from "@database/withTransaction";
import { decrypt, encrypt } from "@functions/crypto";
import { HttpError } from "@functions/HttpError";
import { CONNECTION_META } from "@infra/kubernetes/databaseManifests";
import type { ManagedDatabase, ManagedServiceKind, ManagedSize, Prisma } from "@prisma-generated/client";

export interface CreateDatabaseInput {
  projectId: string;
  environmentId: string;
  name: string;
  kind: ManagedServiceKind;
  size?: ManagedSize;
  highAvailability?: boolean;
  username?: string;
  password?: string;
  database?: string;
  backupEnabled?: boolean;
  backupSchedule?: string;
  retentionDays?: number;
}

export interface DatabaseConfig {
  username: string;
  passwordCipher: string;
  database: string;
  backup: { enabled: boolean; schedule: string; retentionDays: number };
}

export interface DatabaseDetail extends Omit<ManagedDatabase, "config"> {
  username: string;
  database: string;
  connectionUrl: string;
  backup: { enabled: boolean; schedule: string; retentionDays: number };
}

/**
 * Bancos gerenciados. O usuário informa nome/tamanho (+ HA, usuário/senha,
 * backups). A plataforma gera credenciais quando ausentes, reconcilia via
 * Operator (escondido), monta a URL de conexão automaticamente e injeta nas
 * aplicações conectadas.
 */
@Injectable()
export class ManagedDatabaseService {
  constructor(
    private readonly databases: ManagedDatabaseRepository,
    private readonly apps: ApplicationRepository,
    private readonly envVars: EnvVarRepository,
    private readonly environments: EnvironmentRepository,
    private readonly reconcilers: ReconcilerFactory,
    private readonly kube: KubeContextResolver,
  ) {}

  listByProject(projectId: string, tenant: { organizationId: string }): Promise<ManagedDatabase[]> {
    return withTransaction(() => this.databases.listByProject(projectId), { tenant });
  }

  async create(input: CreateDatabaseInput, tenant: { organizationId: string }): Promise<ManagedDatabase> {
    const config: DatabaseConfig = {
      username: input.username || "capiva",
      passwordCipher: encrypt(input.password || crypto.randomBytes(18).toString("base64url")),
      database: input.database || input.name.replace(/[^a-zA-Z0-9_]/g, "_"),
      backup: {
        enabled: input.backupEnabled ?? true,
        schedule: input.backupSchedule || "0 3 * * *",
        retentionDays: input.retentionDays ?? 7,
      },
    };

    const db = await withTransaction(
      () =>
        this.databases.create({
          projectId: input.projectId,
          environmentId: input.environmentId,
          name: input.name,
          kind: input.kind,
          size: input.size ?? "SMALL",
          highAvailability: input.highAvailability ?? false,
          config: config as unknown as Prisma.InputJsonValue,
        }),
      { tenant },
    );

    // Reconciliação não-fatal: se o Operator do banco não estiver instalado no
    // cluster, a entidade é criada mesmo assim e o status reflete o problema.
    try {
      const ctx = await this.kube.forEnvironment(input.environmentId, tenant);
      const status = await this.reconcilers.forDatabase().reconcile(db, ctx);
      await withTransaction(() => this.databases.updateStatus(db.id, status.ready ? "running" : "provisioning"), { tenant });
    } catch (error) {
      console.error("[db] reconcile falhou (operator ausente?):", (error as Error).message);
      await withTransaction(() => this.databases.updateStatus(db.id, "operator-missing"), { tenant });
    }
    return db;
  }

  /** Detalhe com URL de conexão montada automaticamente (senha real revelada ao dono). */
  async getDetail(id: string, tenant: { organizationId: string }): Promise<DatabaseDetail> {
    const db = await withTransaction(() => this.databases.findById(id), { tenant });
    if (!db) throw HttpError.notFound("Banco não encontrado.");
    // Normaliza configs antigas/parciais (sem backup/username) com defaults.
    const cfg = normalizeConfig(db.config as unknown as Partial<DatabaseConfig> | null, db.name);
    const env = await withTransaction(() => this.environments.findById(db.environmentId), { tenant });
    const { config, ...rest } = db;
    return {
      ...rest,
      username: cfg.username,
      database: cfg.database,
      connectionUrl: buildUrl(db, cfg, env?.namespace ?? "default"),
      backup: cfg.backup,
    };
  }

  async update(
    id: string,
    patch: { backupEnabled?: boolean; backupSchedule?: string; retentionDays?: number; password?: string },
    tenant: { organizationId: string },
  ): Promise<ManagedDatabase> {
    return withTransaction(async () => {
      const db = await this.databases.findById(id);
      if (!db) throw HttpError.notFound("Banco não encontrado.");
      const cfg = normalizeConfig(db.config as unknown as Partial<DatabaseConfig> | null, db.name);
      const next: DatabaseConfig = {
        ...cfg,
        passwordCipher: patch.password ? encrypt(patch.password) : cfg.passwordCipher,
        backup: {
          enabled: patch.backupEnabled ?? cfg.backup.enabled,
          schedule: patch.backupSchedule ?? cfg.backup.schedule,
          retentionDays: patch.retentionDays ?? cfg.backup.retentionDays,
        },
      };
      return this.databases.updateConfig(id, next as unknown as Prisma.InputJsonValue);
    }, { tenant });
  }

  /** Conecta um banco a uma aplicação: injeta a URL de conexão como variável. */
  async attachToApplication(databaseId: string, applicationId: string, tenant: { organizationId: string }): Promise<void> {
    await withTransaction(async () => {
      const db = await this.databases.findById(databaseId);
      const app = await this.apps.findById(applicationId);
      if (!db || !app) throw HttpError.notFound("Banco ou aplicação não encontrados.");
      const cfg = normalizeConfig(db.config as unknown as Partial<DatabaseConfig> | null, db.name);
      const env = await this.environments.findById(db.environmentId);
      const meta = CONNECTION_META[db.kind] ?? CONNECTION_META.POSTGRESQL;
      const url = buildUrl(db, cfg, env?.namespace ?? "default");
      await this.envVars.upsert({ applicationId, key: meta.envKey, value: encrypt(url), secret: true, source: "INJECTED" });
    }, { tenant });
  }
}

/** Lê as configurações de backup de um `config` (JSON) aplicando defaults. */
export function readBackupConfig(config: Partial<DatabaseConfig> | null): DatabaseConfig["backup"] {
  return {
    enabled: config?.backup?.enabled ?? true,
    schedule: config?.backup?.schedule ?? "0 3 * * *",
    retentionDays: config?.backup?.retentionDays ?? 7,
  };
}

/** Completa configs antigas/parciais com defaults (sempre tem username/database/backup). */
function normalizeConfig(config: Partial<DatabaseConfig> | null, name: string): DatabaseConfig {
  return {
    username: config?.username ?? "capiva",
    passwordCipher: config?.passwordCipher ?? encrypt("changeme"),
    database: config?.database ?? name.replace(/[^a-zA-Z0-9_]/g, "_"),
    backup: readBackupConfig(config),
  };
}

/** Monta a URL de conexão automaticamente a partir do tipo/credenciais/namespace. */
function buildUrl(db: ManagedDatabase, cfg: DatabaseConfig, namespace: string): string {
  const meta = CONNECTION_META[db.kind] ?? CONNECTION_META.POSTGRESQL;
  const host = `${meta.host(db.name)}.${namespace}.svc.cluster.local`;
  const password = safeDecrypt(cfg.passwordCipher);
  if (!meta.scheme) return `${host}:${meta.port}`; // ex.: Kafka brokers
  const auth = `${encodeURIComponent(cfg.username)}:${encodeURIComponent(password)}@`;
  return `${meta.scheme}://${auth}${host}:${meta.port}/${cfg.database}`;
}

function safeDecrypt(value: string): string {
  try {
    return decrypt(value);
  } catch {
    return value;
  }
}
