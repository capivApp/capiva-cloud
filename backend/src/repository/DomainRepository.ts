import { Injectable } from "@di/index";
import { BaseRepository } from "@repository/BaseRepository";
import type { Domain, Prisma } from "@prisma-generated/client";

@Injectable()
export class DomainRepository extends BaseRepository {
  listByApplication(applicationId: string): Promise<Domain[]> {
    return this.tx.domain.findMany({ where: { applicationId }, orderBy: { createdAt: "asc" } });
  }

  findById(id: string): Promise<Domain | null> {
    return this.tx.domain.findUnique({ where: { id } });
  }

  findByHost(host: string): Promise<Domain | null> {
    return this.tx.domain.findUnique({ where: { host } });
  }

  create(data: Prisma.DomainUncheckedCreateInput): Promise<Domain> {
    return this.tx.domain.create({ data });
  }

  delete(id: string): Promise<Domain> {
    return this.tx.domain.delete({ where: { id } });
  }
}
