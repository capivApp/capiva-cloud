import { Injectable } from "@di/index";
import { BaseRepository } from "@repository/BaseRepository";
import type { Prisma, StorageProvider } from "@prisma-generated/client";

@Injectable()
export class StorageProviderRepository extends BaseRepository {
  create(data: Prisma.StorageProviderUncheckedCreateInput): Promise<StorageProvider> {
    return this.tx.storageProvider.create({ data });
  }

  listByOrganization(organizationId: string): Promise<StorageProvider[]> {
    return this.tx.storageProvider.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" } });
  }

  findById(id: string): Promise<StorageProvider | null> {
    return this.tx.storageProvider.findUnique({ where: { id } });
  }

  findDefault(organizationId: string): Promise<StorageProvider | null> {
    return this.tx.storageProvider.findFirst({ where: { organizationId, isDefault: true } });
  }

  /** Garante um único default por org. */
  clearDefault(organizationId: string): Promise<Prisma.BatchPayload> {
    return this.tx.storageProvider.updateMany({ where: { organizationId, isDefault: true }, data: { isDefault: false } });
  }

  delete(id: string): Promise<StorageProvider> {
    return this.tx.storageProvider.delete({ where: { id } });
  }
}
