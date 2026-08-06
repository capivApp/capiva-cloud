import { Injectable } from "@di/index";
import { BaseRepository } from "@repository/BaseRepository";
import type { Domain, Prisma } from "@prisma-generated/client";

@Injectable()
export class DomainRepository extends BaseRepository {
  listByApplication(applicationId: string): Promise<Domain[]> {
    return this.tx.domain.findMany({
      where: { applicationId, ...this.scope("domain") },
      orderBy: { createdAt: "asc" },
    });
  }

  findById(id: string): Promise<Domain | null> {
    return this.tx.domain.findFirst({ where: { id, ...this.scope("domain") } });
  }

  /**
   * Checagem de unicidade GLOBAL do host (o campo é `@unique` no schema): um
   * domínio só pode apontar para uma aplicação em toda a plataforma. Por isso
   * não é escopada por organização.
   */
  findByHost(host: string): Promise<Domain | null> {
    return this.tx.domain.findUnique({ where: { host } });
  }

  async create(data: Prisma.DomainUncheckedCreateInput): Promise<Domain> {
    await this.ensureScoped(
      () => this.tx.application.findFirst({ where: { id: data.applicationId, ...this.scope("application") } }),
      "Aplicação",
    );
    return this.tx.domain.create({ data });
  }

  async delete(id: string): Promise<Domain> {
    await this.ensureScoped(() => this.findById(id), "Domínio");
    return this.tx.domain.delete({ where: { id } });
  }
}
