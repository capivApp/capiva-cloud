import { Injectable } from "@di/index";
import { BaseRepository } from "@repository/BaseRepository";
import type { GitConnection, Prisma } from "@prisma-generated/client";

@Injectable()
export class GitConnectionRepository extends BaseRepository {
  create(data: Prisma.GitConnectionUncheckedCreateInput): Promise<GitConnection> {
    return this.tx.gitConnection.create({ data });
  }

  listByOrganization(organizationId: string): Promise<GitConnection[]> {
    return this.tx.gitConnection.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" } });
  }

  findById(id: string): Promise<GitConnection | null> {
    return this.tx.gitConnection.findUnique({ where: { id } });
  }

  update(id: string, data: Prisma.GitConnectionUncheckedUpdateInput): Promise<GitConnection> {
    return this.tx.gitConnection.update({ where: { id }, data });
  }

  delete(id: string): Promise<GitConnection> {
    return this.tx.gitConnection.delete({ where: { id } });
  }
}
