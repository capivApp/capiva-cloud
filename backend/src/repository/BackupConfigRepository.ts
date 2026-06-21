import { Injectable } from "@di/index";
import { BaseRepository } from "@repository/BaseRepository";
import type { BackupConfig, Prisma } from "@prisma-generated/client";

@Injectable()
export class BackupConfigRepository extends BaseRepository {
  findByOrganization(organizationId: string): Promise<BackupConfig | null> {
    return this.tx.backupConfig.findUnique({ where: { organizationId } });
  }

  upsert(organizationId: string, data: Omit<Prisma.BackupConfigUncheckedCreateInput, "organizationId">): Promise<BackupConfig> {
    return this.tx.backupConfig.upsert({
      where: { organizationId },
      create: { organizationId, ...data },
      update: data,
    });
  }
}
