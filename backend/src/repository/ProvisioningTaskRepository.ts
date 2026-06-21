import { Injectable } from "@di/index";
import { BaseRepository } from "@repository/BaseRepository";
import type { Prisma, ProvisioningTask } from "@prisma-generated/client";

@Injectable()
export class ProvisioningTaskRepository extends BaseRepository {
  create(data: Prisma.ProvisioningTaskUncheckedCreateInput): Promise<ProvisioningTask> {
    return this.tx.provisioningTask.create({ data });
  }
  async appendLog(id: string, line: string): Promise<ProvisioningTask> {
    const t = await this.tx.provisioningTask.findUnique({ where: { id } });
    return this.tx.provisioningTask.update({ where: { id }, data: { log: `${t?.log ?? ""}${line}\n` } });
  }
  finish(id: string, status: "success" | "failed"): Promise<ProvisioningTask> {
    return this.tx.provisioningTask.update({ where: { id }, data: { status, finishedAt: new Date() } });
  }
  listByCluster(clusterId: string): Promise<ProvisioningTask[]> {
    return this.tx.provisioningTask.findMany({ where: { clusterId }, orderBy: { createdAt: "desc" }, take: 20 });
  }
}
