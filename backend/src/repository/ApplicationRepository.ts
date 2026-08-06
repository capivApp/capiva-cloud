import { Injectable } from "@di/index";
import { BaseRepository } from "@repository/BaseRepository";
import type { Prisma, Application } from "@prisma-generated/client";

@Injectable()
export class ApplicationRepository extends BaseRepository {
  async create(data: Prisma.ApplicationUncheckedCreateInput): Promise<Application> {
    await this.assertParents({ project: data.projectId, environment: data.environmentId });
    return this.tx.application.create({ data });
  }

  /** Busca restrita à organização ativa (ver BaseRepository.scope). */
  findById(id: string): Promise<Application | null> {
    return this.tx.application.findFirst({ where: { id, ...this.scope("application") } });
  }

  listByProject(projectId: string): Promise<Application[]> {
    return this.tx.application.findMany({
      where: { projectId, ...this.scope("application") },
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * Aplicações vinculadas a uma conexão Git — usadas no auto-deploy por webhook.
   * O tenant vem da própria conexão (resolvida antes), então segue escopado.
   */
  listByGitConnection(gitConnectionId: string): Promise<Application[]> {
    return this.tx.application.findMany({ where: { gitConnectionId, ...this.scope("application") } });
  }

  async updateStatus(id: string, observedStatus: string): Promise<Application> {
    await this.ensureScoped(() => this.findById(id), "Aplicação");
    return this.tx.application.update({ where: { id }, data: { observedStatus } });
  }

  async update(id: string, data: Prisma.ApplicationUncheckedUpdateInput): Promise<Application> {
    await this.ensureScoped(() => this.findById(id), "Aplicação");
    return this.tx.application.update({ where: { id }, data });
  }

  async delete(id: string): Promise<Application> {
    await this.ensureScoped(() => this.findById(id), "Aplicação");
    return this.tx.application.delete({ where: { id } });
  }
}
