import { Injectable } from "@di/index";
import { BaseRepository } from "@repository/BaseRepository";
import type { Backup, Prisma } from "@prisma-generated/client";

@Injectable()
export class BackupRepository extends BaseRepository {
  create(data: Prisma.BackupUncheckedCreateInput): Promise<Backup> {
    return this.tx.backup.create({ data });
  }

  listByVolume(volumeId: string): Promise<Backup[]> {
    return this.tx.backup.findMany({ where: { volumeId }, orderBy: { startedAt: "desc" } });
  }

  listByDatabase(databaseId: string): Promise<Backup[]> {
    return this.tx.backup.findMany({ where: { databaseId }, orderBy: { startedAt: "desc" } });
  }

  findById(id: string): Promise<Backup | null> {
    return this.tx.backup.findUnique({ where: { id } });
  }

  /** Backup mais recente de um banco (para dedupe do scheduler). */
  latestForDatabase(databaseId: string): Promise<Backup | null> {
    return this.tx.backup.findFirst({ where: { databaseId }, orderBy: { startedAt: "desc" } });
  }

  /** Remove registros de backup de um banco anteriores à data (retenção). */
  async deleteOlderThan(databaseId: string, before: Date): Promise<number> {
    const { count } = await this.tx.backup.deleteMany({ where: { databaseId, startedAt: { lt: before } } });
    return count;
  }

  update(id: string, data: Prisma.BackupUncheckedUpdateInput): Promise<Backup> {
    return this.tx.backup.update({ where: { id }, data });
  }
}
