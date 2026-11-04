import { Injectable } from "@di/index";
import { BaseRepository } from "@repository/BaseRepository";
import type { CronJob, Prisma } from "@prisma-generated/client";

@Injectable()
export class CronJobRepository extends BaseRepository {
  async create(data: Prisma.CronJobUncheckedCreateInput): Promise<CronJob> {
    await this.assertParents({ project: data.projectId });
    return this.tx.cronJob.create({ data });
  }

  listByProject(projectId: string): Promise<CronJob[]> {
    return this.tx.cronJob.findMany({
      where: { projectId, ...this.scope("cronJob") },
      orderBy: { createdAt: "asc" },
    });
  }

  findById(id: string): Promise<CronJob | null> {
    return this.tx.cronJob.findFirst({ where: { id, ...this.scope("cronJob") } });
  }

  async updateStatus(id: string, observedStatus: string): Promise<CronJob> {
    await this.ensureScoped(() => this.findById(id), "Cron job");
    return this.tx.cronJob.update({ where: { id }, data: { observedStatus } });
  }

  async update(id: string, data: Prisma.CronJobUncheckedUpdateInput): Promise<CronJob> {
    await this.ensureScoped(() => this.findById(id), "Cron job");
    return this.tx.cronJob.update({ where: { id }, data });
  }

  async delete(id: string): Promise<CronJob> {
    await this.ensureScoped(() => this.findById(id), "Cron job");
    return this.tx.cronJob.delete({ where: { id } });
  }
}
