import { Injectable } from "@di/index";
import { BaseRepository } from "@repository/BaseRepository";
import type { ManagedDatabase, Prisma } from "@prisma-generated/client";

@Injectable()
export class ManagedDatabaseRepository extends BaseRepository {
  async create(data: Prisma.ManagedDatabaseUncheckedCreateInput): Promise<ManagedDatabase> {
    await this.assertParents({ project: data.projectId, environment: data.environmentId });
    return this.tx.managedDatabase.create({ data });
  }

  listByProject(projectId: string): Promise<ManagedDatabase[]> {
    return this.tx.managedDatabase.findMany({
      where: { projectId, ...this.scope("managedDatabase") },
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * Todos os bancos com o organizationId do projeto (scheduler de backups).
   * Roda fora de tenant de propósito — varre a plataforma inteira e usa o
   * organizationId retornado para abrir uma transação escopada por banco.
   */
  listAllWithOrg(): Promise<(ManagedDatabase & { project: { organizationId: string } })[]> {
    return this.tx.managedDatabase.findMany({
      include: { project: { select: { organizationId: true } } },
    });
  }

  findById(id: string): Promise<ManagedDatabase | null> {
    return this.tx.managedDatabase.findFirst({ where: { id, ...this.scope("managedDatabase") } });
  }

  /** Banco com o mesmo nome no ambiente: o nome vira o nome do recurso no namespace. */
  findByNameInEnvironment(environmentId: string, name: string): Promise<ManagedDatabase | null> {
    return this.tx.managedDatabase.findFirst({
      where: { environmentId, name, ...this.scope("managedDatabase") },
    });
  }

  async updateStatus(id: string, observedStatus: string): Promise<ManagedDatabase> {
    await this.ensureScoped(() => this.findById(id), "Banco");
    return this.tx.managedDatabase.update({ where: { id }, data: { observedStatus } });
  }

  async updateConfig(id: string, config: Prisma.InputJsonValue): Promise<ManagedDatabase> {
    await this.ensureScoped(() => this.findById(id), "Banco");
    return this.tx.managedDatabase.update({ where: { id }, data: { config } });
  }

  async delete(id: string): Promise<ManagedDatabase> {
    await this.ensureScoped(() => this.findById(id), "Banco");
    return this.tx.managedDatabase.delete({ where: { id } });
  }
}
