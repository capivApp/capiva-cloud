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

  update(id: string, data: Prisma.BackupUncheckedUpdateInput): Promise<Backup> {
    return this.tx.backup.update({ where: { id }, data });
  }
}
