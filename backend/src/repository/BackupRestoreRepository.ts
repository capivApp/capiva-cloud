import { Injectable } from "@di/index";
import { BaseRepository } from "@repository/BaseRepository";
import type { BackupRestore, Prisma } from "@prisma-generated/client";

/**
 * Andamento dos restores de backup. A linha carrega o `organizationId`, então
 * toda leitura é escopada direto pela organização ativa.
 */
@Injectable()
export class BackupRestoreRepository extends BaseRepository {
  create(data: Prisma.BackupRestoreUncheckedCreateInput): Promise<BackupRestore> {
    return this.tx.backupRestore.create({ data });
  }

  findById(id: string): Promise<BackupRestore | null> {
    return this.tx.backupRestore.findFirst({ where: { id, ...this.scope("backupRestore") } });
  }

  /** Restores pedidos a partir dos backups de um banco (inclui os feitos como cópia). */
  listByDatabase(databaseId: string): Promise<BackupRestore[]> {
    return this.tx.backupRestore.findMany({
      where: { sourceDatabaseId: databaseId, ...this.scope("backupRestore") },
      orderBy: { startedAt: "desc" },
      take: 20,
    });
  }

  listByVolume(volumeId: string): Promise<BackupRestore[]> {
    return this.tx.backupRestore.findMany({
      where: { volumeId, ...this.scope("backupRestore") },
      orderBy: { startedAt: "desc" },
      take: 20,
    });
  }

  async update(id: string, data: Prisma.BackupRestoreUncheckedUpdateInput): Promise<BackupRestore> {
    await this.ensureScoped(() => this.findById(id), "Restore");
    return this.tx.backupRestore.update({ where: { id }, data });
  }
}
