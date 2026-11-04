import { Injectable } from "@di/index";
import { withTransaction } from "@database/withTransaction";
import { decrypt } from "@functions/crypto";
import type { Application, ManagedDatabase } from "@prisma-generated/client";
import { ApplicationRepository } from "@repository/ApplicationRepository";
import { BackupRepository } from "@repository/BackupRepository";
import { EnvironmentRepository } from "@repository/EnvironmentRepository";
import { EnvVarRepository } from "@repository/EnvVarRepository";
import { ManagedDatabaseRepository } from "@repository/ManagedDatabaseRepository";
import { DatabaseRestoreService } from "@service/DatabaseRestoreService";
import { ManagedDatabaseService, internalHostOf } from "@service/ManagedDatabaseService";
import {
  buildPreviewDatabaseName,
  findBancosDaOrigem,
  pickBackupRestauravel,
} from "@service/preview/previewDatabase";
import { isRestoreSuportado } from "@service/restore/restoreKind.strategy";

type Tenant = { organizationId: string };

/** Quanto o preview espera a cópia dos dados antes do deploy (a migration não pode correr antes). */
export interface RestoreWait {
  pollMs: number;
  timeoutMs: number;
}

const DEFAULT_TIMEOUT_SECONDS = 900;

export const readRestoreWait = (
  env: Record<string, string | undefined> = process.env,
): RestoreWait => {
  const seconds = Number(env.CAPIVA_PREVIEW_RESTORE_TIMEOUT_SECONDS);
  return {
    pollMs: 10_000,
    timeoutMs: (Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_TIMEOUT_SECONDS) * 1000,
  };
};

type FimDaCopia = "COMPLETED" | "FAILED" | "TIMEOUT";
const FINAIS = new Set<string>(["COMPLETED", "FAILED"]);

const AVISO_DA_COPIA: Record<FimDaCopia, (banco: string) => string[]> = {
  COMPLETED: () => [],
  FAILED: (banco) => [`O banco ${banco} subiu vazio no preview: a cópia dos dados falhou.`],
  TIMEOUT: (banco) => [
    `A cópia dos dados do banco ${banco} ainda não terminou. O preview pode subir antes dela.`,
  ],
};

/** O restore como cópia sempre cria o banco de destino: sem ele, o vínculo do preview sairia errado. */
const requireCloneId = (targetDatabaseId: string | null): string => {
  if (!targetDatabaseId) throw new Error("Restore como cópia sem banco de destino.");
  return targetDatabaseId;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Conexão injetada cifrada; valor que não decifra não é conexão de banco gerenciado. */
const decryptOrEmpty = (value: string): string => {
  try {
    return decrypt(value);
  } catch {
    return "";
  }
};

/**
 * Clona para o preview de PR os bancos gerenciados que a origem usa, para uma migration
 * no boot do preview não tocar o banco de produção. Os dados vêm do último backup
 * (restore como cópia). Cada clone fica marcado com o preview e morre com ele.
 */
@Injectable()
export class PreviewDatabaseCloner {
  constructor(
    private readonly databases: ManagedDatabaseRepository,
    private readonly environments: EnvironmentRepository,
    private readonly envVars: EnvVarRepository,
    private readonly backups: BackupRepository,
    private readonly managedDatabases: ManagedDatabaseService,
    private readonly restores: DatabaseRestoreService,
    private readonly apps: ApplicationRepository,
  ) {}

  /** Clona e liga ao preview. Devolve os avisos (banco vazio, cópia falhou) para o PR. */
  async cloneForPreview(
    origem: Application,
    preview: Application,
    tenant: Tenant,
    wait: RestoreWait = readRestoreWait(),
  ): Promise<string[]> {
    const bancos = await this.findBancosUsados(origem, tenant);
    const notes: string[] = [];
    for (const banco of bancos)
      notes.push(...(await this.cloneBanco(banco, preview, tenant, wait)));
    return notes;
  }

  async removeForPreview(previewId: string, tenant: Tenant): Promise<void> {
    const clones = await withTransaction(() => this.databases.listByPreviewApplication(previewId), {
      tenant,
    });
    for (const clone of clones) await this.managedDatabases.remove(clone.id, tenant);
  }

  /**
   * Clones cujo preview não existe mais (a origem foi apagada e levou os previews
   * junto, sem passar pela remoção do preview). Roda no scheduler de limpeza.
   */
  async removeOrphans(): Promise<number> {
    const clones = await withTransaction(() => this.databases.listPreviewClonesWithOrg(), {});
    let removidos = 0;
    for (const clone of clones) {
      const tenant = { organizationId: clone.project.organizationId };
      const preview = await withTransaction(
        () => this.apps.findById(clone.previewOfApplicationId),
        { tenant },
      );
      if (preview) continue;
      await this.managedDatabases.remove(clone.id, tenant);
      removidos++;
    }
    return removidos;
  }

  /** Bancos do projeto cuja conexão foi injetada na origem (o `attach` não grava vínculo). */
  private findBancosUsados(origem: Application, tenant: Tenant): Promise<ManagedDatabase[]> {
    return withTransaction(
      async () => {
        const candidatos = (await this.databases.listByProject(origem.projectId)).filter(
          (db) => !db.previewOfApplicationId,
        );
        const comHost = await Promise.all(
          candidatos.map(async (db) => ({
            db,
            host: internalHostOf(db, await this.namespaceOf(db)),
          })),
        );
        const conexoes = (await this.envVars.listByApplication(origem.id))
          .filter((v) => v.source === "INJECTED")
          .map((v) => decryptOrEmpty(v.value));
        return findBancosDaOrigem(conexoes, comHost).map(({ db }) => db);
      },
      { tenant },
    );
  }

  private async namespaceOf(db: ManagedDatabase): Promise<string> {
    const env = await this.environments.findById(db.environmentId);
    return env?.namespace ?? "default";
  }

  private async cloneBanco(
    banco: ManagedDatabase,
    preview: Application,
    tenant: Tenant,
    wait: RestoreWait,
  ): Promise<string[]> {
    const nome = buildPreviewDatabaseName(preview.previewPrNumber ?? 0, banco.name);
    if (!isRestoreSuportado(banco.kind))
      return this.cloneVazio(
        banco,
        nome,
        preview,
        tenant,
        `o tipo ${banco.kind} não tem cópia de dados`,
      );
    const backups = await withTransaction(() => this.backups.listByDatabase(banco.id), { tenant });
    const backup = pickBackupRestauravel(backups);
    if (!backup) return this.cloneVazio(banco, nome, preview, tenant, "não há backup concluído");

    const restore = await this.restores.requestRestore(
      banco.id,
      backup.id,
      { mode: "AS_COPY", newName: nome },
      tenant,
    );
    await this.link(requireCloneId(restore.targetDatabaseId), preview, tenant);
    const fim = await this.waitCopia(banco.id, restore.id, tenant, wait);
    return AVISO_DA_COPIA[fim](banco.name);
  }

  private async cloneVazio(
    banco: ManagedDatabase,
    nome: string,
    preview: Application,
    tenant: Tenant,
    motivo: string,
  ): Promise<string[]> {
    const clone = await this.restores.createCopyOf(banco, nome, tenant);
    await this.link(clone.id, preview, tenant);
    return [`O banco ${banco.name} subiu vazio no preview: ${motivo}.`];
  }

  /** Marca antes de ligar: se o attach falhar, o clone já é removível junto com o preview. */
  private async link(cloneId: string, preview: Application, tenant: Tenant): Promise<void> {
    await withTransaction(() => this.databases.markAsPreviewOf(cloneId, preview.id), { tenant });
    await this.managedDatabases.attachToApplication(cloneId, preview.id, tenant);
  }

  private async waitCopia(
    databaseId: string,
    restoreId: string,
    tenant: Tenant,
    wait: RestoreWait,
  ): Promise<FimDaCopia> {
    const prazo = Date.now() + wait.timeoutMs;
    while (Date.now() < prazo) {
      const { status } = await this.restores.getById(databaseId, restoreId, tenant);
      if (FINAIS.has(status)) return status as FimDaCopia;
      await sleep(wait.pollMs);
    }
    return "TIMEOUT";
  }
}
