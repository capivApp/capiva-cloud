import crypto from "crypto";
import { Injectable } from "@di/index";
import { ManagedDatabaseRepository } from "@repository/ManagedDatabaseRepository";
import { ApplicationRepository } from "@repository/ApplicationRepository";
import { EnvVarRepository } from "@repository/EnvVarRepository";
import { EnvironmentRepository } from "@repository/EnvironmentRepository";
import { ReconcilerFactory } from "@infra/kubernetes/ReconcilerFactory";
import { KubernetesAdapter } from "@infra/kubernetes/KubernetesAdapter";
import { OperatorInstallerService } from "@service/OperatorInstallerService";
import { KubeContextResolver } from "@service/KubeContextResolver";
import { withTransaction } from "@database/withTransaction";
import { decrypt, encrypt } from "@functions/crypto";
import { HttpError } from "@functions/HttpError";
import { CONNECTION_META, EXTERNAL_DB, databaseManifest } from "@infra/kubernetes/databaseManifests";
import { interpretDbStatus } from "@infra/kubernetes/reconcilers/DatabaseReconciler";
import type { KubeContext } from "@interface/integrations";
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
  /** Senha aleatória do superusuário (root, `postgres`) — gerada na criação. */
  superuserPasswordCipher: string;
  backup: { enabled: boolean; schedule: string; retentionDays: number };
}

export interface DatabaseDetail extends Omit<ManagedDatabase, "config"> {
  username: string;
  database: string;
  connectionUrl: string;
  /** URL de acesso EXTERNO (IP do nó + NodePort). null se indisponível/não suportado. */
  connectionUrlExternal: string | null;
  /** URL como superusuário `postgres` (root) — interna e externa. null se não aplicável. */
  superuserUrl: string | null;
  superuserUrlExternal: string | null;
  /** Topologia/saúde vivos do operator. null quando o cluster não responde. */
  instances: number | null;
  readyInstances: number | null;
  phase: string | null;
  healthy: boolean;
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
    private readonly k8s: KubernetesAdapter,
    private readonly operators: OperatorInstallerService,
  ) {}

  listByProject(projectId: string, tenant: { organizationId: string }): Promise<ManagedDatabase[]> {
    return withTransaction(() => this.databases.listByProject(projectId), { tenant });
  }

  async create(input: CreateDatabaseInput, tenant: { organizationId: string }): Promise<ManagedDatabase> {
    const config: DatabaseConfig = {
      username: input.username || "capiva",
      passwordCipher: encrypt(input.password || crypto.randomBytes(18).toString("base64url")),
      database: input.database || input.name.replace(/[^a-zA-Z0-9_]/g, "_"),
      superuserPasswordCipher: encrypt(crypto.randomBytes(24).toString("base64url")),
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
      // Garante o operator do tipo instalado (idempotente) ANTES de reconciliar —
      // usa as credenciais salvas do cluster, sem depender de SSH/provisionamento.
      await this.operators.ensure(ctx, db.kind);
      const status = await this.reconcilers.forDatabase().reconcile(db, ctx);
      await withTransaction(() => this.databases.updateStatus(db.id, status.ready ? "running" : "provisioning"), { tenant });
    } catch (error) {
      console.error("[db] provisionamento falhou (operator/reconcile):", (error as Error).message);
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
    const namespace = env?.namespace ?? "default";
    const live = await this.liveStatus(db, namespace, tenant).catch(() => null);
    const meta = CONNECTION_META[db.kind] ?? CONNECTION_META.POSTGRESQL;
    const internalHost = `${meta.host(db.name)}.${namespace}.svc.cluster.local`;
    const password = safeDecrypt(cfg.passwordCipher);
    const superuserPw = safeDecrypt(cfg.superuserPasswordCipher);
    const isPg = db.kind === "POSTGRESQL";
    const { config, ...rest } = db;
    return {
      ...rest,
      username: cfg.username,
      database: cfg.database,
      connectionUrl: urlWith(db, internalHost, meta.port, cfg.username, password, cfg.database),
      connectionUrlExternal: live?.external ? urlWith(db, live.external.ip, live.external.port, cfg.username, password, cfg.database) : null,
      superuserUrl: isPg ? urlWith(db, internalHost, meta.port, "postgres", superuserPw, cfg.database) : null,
      superuserUrlExternal: isPg && live?.external ? urlWith(db, live.external.ip, live.external.port, "postgres", superuserPw, cfg.database) : null,
      instances: live?.instances ?? null,
      readyInstances: live?.readyInstances ?? null,
      phase: live?.phase ?? null,
      healthy: Boolean(live?.healthy),
      backup: cfg.backup,
    };
  }

  /** Estado vivo (topologia/fase/saúde) para o stream SSE e o detalhe. */
  async status(id: string, tenant: { organizationId: string }): Promise<{ instances: number | null; readyInstances: number | null; phase: string | null; healthy: boolean; observedStatus: string }> {
    const db = await withTransaction(() => this.databases.findById(id), { tenant });
    if (!db) throw HttpError.notFound("Banco não encontrado.");
    const env = await withTransaction(() => this.environments.findById(db.environmentId), { tenant });
    const live = await this.liveStatus(db, env?.namespace ?? "default", tenant).catch(() => null);
    return {
      instances: live?.instances ?? null,
      readyInstances: live?.readyInstances ?? null,
      phase: live?.phase ?? null,
      healthy: Boolean(live?.healthy),
      observedStatus: db.observedStatus,
    };
  }

  /**
   * Estado vivo do banco (topologia + endpoint externo). Lê o status do operator
   * e o NodePort/IP do nó. Best-effort: se o cluster não responder, devolve null.
   */
  private async liveStatus(
    db: ManagedDatabase,
    namespace: string,
    tenant: { organizationId: string },
  ): Promise<{ instances: number | null; readyInstances: number | null; phase: string | null; healthy: boolean; external: { ip: string; port: number } | null }> {
    const ctx = await this.kube.forEnvironment(db.environmentId, tenant);
    const manifest = databaseManifest(db.kind, { name: db.name, namespace, size: db.size, ha: db.highAvailability });
    const status = interpretDbStatus(await this.k8s.observe(ctx, manifest.apiVersion, manifest.kind, db.name));
    return {
      instances: status.instances ?? null,
      readyInstances: status.readyInstances ?? null,
      phase: status.phase ?? null,
      healthy: Boolean(status.ready),
      external: await this.externalEndpoint(db, ctx),
    };
  }

  /** IP do nó + NodePort do acesso externo (tipos suportados). */
  private async externalEndpoint(db: ManagedDatabase, ctx: KubeContext): Promise<{ ip: string; port: number } | null> {
    if (!EXTERNAL_DB[db.kind]) return null;
    const [nodePort, ip] = await Promise.all([this.k8s.serviceNodePort(ctx, `${db.name}-ext`), this.k8s.nodeIP(ctx.kubeconfig)]);
    return nodePort && ip ? { ip, port: nodePort } : null;
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

  /** Remove um banco: destrói os recursos no cluster e apaga o registro. */
  async remove(id: string, tenant: { organizationId: string }): Promise<void> {
    await withTransaction(async () => {
      const db = await this.databases.findById(id);
      if (!db) throw HttpError.notFound("Banco não encontrado.");
      // Destruição no cluster é best-effort: se o cluster/operator não responder,
      // ainda removemos o registro (evita banco "fantasma" preso na UI).
      try {
        const ctx = await this.kube.forEnvironment(db.environmentId, tenant);
        await this.reconcilers.forDatabase().destroy(db, ctx);
      } catch (error) {
        console.error("[db] destroy no cluster falhou (removendo registro mesmo assim):", (error as Error).message);
      }
      await this.databases.delete(id);
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
    superuserPasswordCipher: config?.superuserPasswordCipher ?? encrypt(crypto.randomBytes(24).toString("base64url")),
    backup: readBackupConfig(config),
  };
}

/** Monta a URL de conexão INTERNA (DNS do cluster) com as credenciais da app. */
function buildUrl(db: ManagedDatabase, cfg: DatabaseConfig, namespace: string): string {
  const meta = CONNECTION_META[db.kind] ?? CONNECTION_META.POSTGRESQL;
  return urlWith(db, `${meta.host(db.name)}.${namespace}.svc.cluster.local`, meta.port, cfg.username, safeDecrypt(cfg.passwordCipher), cfg.database);
}

/** Monta a URL para host/porta/credenciais arbitrários (interno, externo, app ou superusuário). */
function urlWith(db: ManagedDatabase, host: string, port: number, username: string, password: string, database: string): string {
  const meta = CONNECTION_META[db.kind] ?? CONNECTION_META.POSTGRESQL;
  if (!meta.scheme) return `${host}:${port}`; // ex.: Kafka brokers
  const auth = `${encodeURIComponent(username)}:${encodeURIComponent(password)}@`;
  return `${meta.scheme}://${auth}${host}:${port}/${database}`;
}

function safeDecrypt(value: string): string {
  try {
    return decrypt(value);
  } catch {
    return value;
  }
}
