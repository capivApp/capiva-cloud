import { Injectable } from "@di/index";
import { BaseRepository } from "@repository/BaseRepository";
import type { CronJob, Prisma } from "@prisma-generated/client";

@Injectable()
export class CronJobRepository extends BaseRepository {
  create(data: Prisma.CronJobUncheckedCreateInput): Promise<CronJob> {
    return this.tx.cronJob.create({ data });
  }
  listByProject(projectId: string): Promise<CronJob[]> {
    return this.tx.cronJob.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } });
  }
  findById(id: string): Promise<CronJob | null> {
    return this.tx.cronJob.findUnique({ where: { id } });
  }
  updateStatus(id: string, observedStatus: string): Promise<CronJob> {
    return this.tx.cronJob.update({ where: { id }, data: { observedStatus } });
  }

  update(id: string, data: Prisma.CronJobUncheckedUpdateInput): Promise<CronJob> {
    return this.tx.cronJob.update({ where: { id }, data });
  }
  delete(id: string): Promise<CronJob> {
    return this.tx.cronJob.delete({ where: { id } });
  }
}
