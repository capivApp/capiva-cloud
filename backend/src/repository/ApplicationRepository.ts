import { Injectable } from "@di/index";
import { BaseRepository } from "@repository/BaseRepository";
import type { Prisma, Application } from "@prisma-generated/client";

@Injectable()
export class ApplicationRepository extends BaseRepository {
  create(data: Prisma.ApplicationUncheckedCreateInput): Promise<Application> {
    return this.tx.application.create({ data });
  }

  findById(id: string): Promise<Application | null> {
    return this.tx.application.findUnique({ where: { id } });
  }

  listByProject(projectId: string): Promise<Application[]> {
    return this.tx.application.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } });
  }

  /** Aplicações vinculadas a uma conexão Git — usadas no auto-deploy por webhook. */
  listByGitConnection(gitConnectionId: string): Promise<Application[]> {
    return this.tx.application.findMany({ where: { gitConnectionId } });
  }

  updateStatus(id: string, observedStatus: string): Promise<Application> {
    return this.tx.application.update({ where: { id }, data: { observedStatus } });
  }

  update(id: string, data: Prisma.ApplicationUncheckedUpdateInput): Promise<Application> {
    return this.tx.application.update({ where: { id }, data });
  }

  delete(id: string): Promise<Application> {
    return this.tx.application.delete({ where: { id } });
  }
}
