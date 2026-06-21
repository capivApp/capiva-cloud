import { Injectable } from "@di/index";
import { BaseRepository } from "@repository/BaseRepository";
import type { Prisma, Worker } from "@prisma-generated/client";

@Injectable()
export class WorkerRepository extends BaseRepository {
  create(data: Prisma.WorkerUncheckedCreateInput): Promise<Worker> {
    return this.tx.worker.create({ data });
  }
  listByProject(projectId: string): Promise<Worker[]> {
    return this.tx.worker.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } });
  }
  findById(id: string): Promise<Worker | null> {
    return this.tx.worker.findUnique({ where: { id } });
  }
  updateStatus(id: string, observedStatus: string): Promise<Worker> {
    return this.tx.worker.update({ where: { id }, data: { observedStatus } });
  }

  update(id: string, data: Prisma.WorkerUncheckedUpdateInput): Promise<Worker> {
    return this.tx.worker.update({ where: { id }, data });
  }
  delete(id: string): Promise<Worker> {
    return this.tx.worker.delete({ where: { id } });
  }
}
