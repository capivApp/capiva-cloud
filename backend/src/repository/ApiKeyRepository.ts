import { Injectable } from "@di/index";
import { BaseRepository } from "@repository/BaseRepository";
import type { ApiKey, Prisma } from "@prisma-generated/client";

@Injectable()
export class ApiKeyRepository extends BaseRepository {
  create(data: Prisma.ApiKeyUncheckedCreateInput): Promise<ApiKey> {
    return this.tx.apiKey.create({ data });
  }

  listByOrganization(organizationId: string): Promise<ApiKey[]> {
    return this.tx.apiKey.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } });
  }

  findByHash(keyHash: string): Promise<ApiKey | null> {
    return this.tx.apiKey.findUnique({ where: { keyHash } });
  }

  findById(id: string): Promise<ApiKey | null> {
    return this.tx.apiKey.findUnique({ where: { id } });
  }

  touch(id: string): Promise<ApiKey> {
    return this.tx.apiKey.update({ where: { id }, data: { lastUsedAt: new Date() } });
  }

  delete(id: string): Promise<ApiKey> {
    return this.tx.apiKey.delete({ where: { id } });
  }
}
