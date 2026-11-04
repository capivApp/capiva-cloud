import { Injectable } from "@di/index";
import { BaseRepository } from "@repository/BaseRepository";
import type { Prisma, Volume } from "@prisma-generated/client";

@Injectable()
export class VolumeRepository extends BaseRepository {
  async create(data: Prisma.VolumeUncheckedCreateInput): Promise<Volume> {
    await this.ensureScoped(
      () =>
        this.tx.application.findFirst({
          where: { id: data.applicationId, ...this.scope("application") },
        }),
      "Aplicação",
    );
    return this.tx.volume.create({ data });
  }

  listByApplication(applicationId: string): Promise<Volume[]> {
    return this.tx.volume.findMany({
      where: { applicationId, ...this.scope("volume") },
      orderBy: { createdAt: "asc" },
    });
  }

  findById(id: string): Promise<Volume | null> {
    return this.tx.volume.findFirst({ where: { id, ...this.scope("volume") } });
  }

  async delete(id: string): Promise<Volume> {
    await this.ensureScoped(() => this.findById(id), "Volume");
    return this.tx.volume.delete({ where: { id } });
  }
}
