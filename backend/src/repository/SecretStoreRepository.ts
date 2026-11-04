import { Injectable } from "@di/index";
import { BaseRepository } from "@repository/BaseRepository";
import type { Prisma, SecretStore } from "@prisma-generated/client";

/** Cofres externos da organização. Só acesso a dados; credenciais já chegam cifradas. */
@Injectable()
export class SecretStoreRepository extends BaseRepository {
  create(data: Prisma.SecretStoreUncheckedCreateInput): Promise<SecretStore> {
    return this.tx.secretStore.create({ data });
  }

  listByOrganization(organizationId: string): Promise<SecretStore[]> {
    return this.tx.secretStore.findMany({
      where: { organizationId, ...this.scope("secretStore") },
      orderBy: { createdAt: "asc" },
    });
  }

  findById(id: string): Promise<SecretStore | null> {
    return this.tx.secretStore.findFirst({ where: { id, ...this.scope("secretStore") } });
  }

  findManyByIds(ids: string[]): Promise<SecretStore[]> {
    return this.tx.secretStore.findMany({
      where: { id: { in: ids }, ...this.scope("secretStore") },
    });
  }

  findByName(organizationId: string, name: string): Promise<SecretStore | null> {
    return this.tx.secretStore.findFirst({
      where: { organizationId, name, ...this.scope("secretStore") },
    });
  }

  /** Ambientes onde o cofre foi materializado (via variáveis das apps). */
  async listEnvironmentIdsInUse(id: string): Promise<string[]> {
    const rows = await this.tx.envVar.findMany({
      where: { secretStoreId: id, ...this.scope("envVar") },
      select: { application: { select: { environmentId: true } } },
    });
    return [...new Set(rows.map((r) => r.application.environmentId))];
  }

  async delete(id: string): Promise<SecretStore> {
    await this.ensureScoped(() => this.findById(id), "Cofre externo");
    return this.tx.secretStore.delete({ where: { id } });
  }
}
