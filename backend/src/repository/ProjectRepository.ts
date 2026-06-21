import { Injectable } from "@di/index";
import { BaseRepository } from "@repository/BaseRepository";
import type { Prisma, Project } from "@prisma-generated/client";

@Injectable()
export class ProjectRepository extends BaseRepository {
  create(data: Prisma.ProjectUncheckedCreateInput): Promise<Project> {
    return this.tx.project.create({ data });
  }

  listByOrganization(organizationId: string): Promise<Project[]> {
    return this.tx.project.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" } });
  }

  findById(id: string): Promise<Project | null> {
    return this.tx.project.findUnique({ where: { id } });
  }

  findBySlug(organizationId: string, slug: string): Promise<Project | null> {
    return this.tx.project.findUnique({ where: { organizationId_slug: { organizationId, slug } } });
  }

  update(id: string, data: Prisma.ProjectUncheckedUpdateInput): Promise<Project> {
    return this.tx.project.update({ where: { id }, data });
  }

  delete(id: string): Promise<Project> {
    return this.tx.project.delete({ where: { id } });
  }
}
