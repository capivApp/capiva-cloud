import { Injectable } from "@di/index";
import { BaseRepository } from "@repository/BaseRepository";
import type { ManagedDatabase, Prisma } from "@prisma-generated/client";

@Injectable()
export class ManagedDatabaseRepository extends BaseRepository {
  create(data: Prisma.ManagedDatabaseUncheckedCreateInput): Promise<ManagedDatabase> {
    return this.tx.managedDatabase.create({ data });
  }

  listByProject(projectId: string): Promise<ManagedDatabase[]> {
    return this.tx.managedDatabase.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } });
  }

  /** Todos os bancos com o organizationId do projeto (usado pelo scheduler de backups). */
  listAllWithOrg(): Promise<(ManagedDatabase & { project: { organizationId: string } })[]> {
    return this.tx.managedDatabase.findMany({ include: { project: { select: { organizationId: true } } } });
  }

  findById(id: string): Promise<ManagedDatabase | null> {
    return this.tx.managedDatabase.findUnique({ where: { id } });
  }

  updateStatus(id: string, observedStatus: string): Promise<ManagedDatabase> {
    return this.tx.managedDatabase.update({ where: { id }, data: { observedStatus } });
  }

  updateConfig(id: string, config: Prisma.InputJsonValue): Promise<ManagedDatabase> {
    return this.tx.managedDatabase.update({ where: { id }, data: { config } });
  }

  delete(id: string): Promise<ManagedDatabase> {
    return this.tx.managedDatabase.delete({ where: { id } });
  }
}
