import { Injectable } from "@di/index";
import { BaseRepository } from "@repository/BaseRepository";
import type { Prisma, Volume } from "@prisma-generated/client";

@Injectable()
export class VolumeRepository extends BaseRepository {
  create(data: Prisma.VolumeUncheckedCreateInput): Promise<Volume> {
    return this.tx.volume.create({ data });
  }
  listByApplication(applicationId: string): Promise<Volume[]> {
    return this.tx.volume.findMany({ where: { applicationId }, orderBy: { createdAt: "asc" } });
  }
  findById(id: string): Promise<Volume | null> {
    return this.tx.volume.findUnique({ where: { id } });
  }
  delete(id: string): Promise<Volume> {
    return this.tx.volume.delete({ where: { id } });
  }
}
