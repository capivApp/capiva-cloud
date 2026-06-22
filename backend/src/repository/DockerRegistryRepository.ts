import { Injectable } from "@di/index";
import { BaseRepository } from "@repository/BaseRepository";
import type { DockerRegistry, Prisma } from "@prisma-generated/client";

@Injectable()
export class DockerRegistryRepository extends BaseRepository {
  create(data: Prisma.DockerRegistryUncheckedCreateInput): Promise<DockerRegistry> {
    return this.tx.dockerRegistry.create({ data });
  }

  listByOrganization(organizationId: string): Promise<DockerRegistry[]> {
    return this.tx.dockerRegistry.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" } });
  }

  findById(id: string): Promise<DockerRegistry | null> {
    return this.tx.dockerRegistry.findUnique({ where: { id } });
  }

  delete(id: string): Promise<DockerRegistry> {
    return this.tx.dockerRegistry.delete({ where: { id } });
  }
}
