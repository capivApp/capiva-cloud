import { Injectable } from "@di/index";
import { ProjectRepository } from "@repository/ProjectRepository";
import { withTransaction } from "@database/withTransaction";
import { HttpError } from "@functions/HttpError";
import { slugify } from "@functions/slug";
import type { Project } from "@prisma-generated/client";

@Injectable()
export class ProjectService {
  constructor(private readonly projects: ProjectRepository) {}

  list(organizationId: string): Promise<Project[]> {
    return withTransaction(() => this.projects.listByOrganization(organizationId), {
      tenant: { organizationId },
    });
  }

  create(organizationId: string, name: string): Promise<Project> {
    return withTransaction(
      async () => {
        const slug = slugify(name);
        if (await this.projects.findBySlug(organizationId, slug)) {
          throw HttpError.conflict("Já existe um projeto com esse nome.");
        }
        return this.projects.create({ organizationId, name, slug });
      },
      { tenant: { organizationId } },
    );
  }

  async getById(organizationId: string, id: string): Promise<Project> {
    const project = await withTransaction(() => this.projects.findById(id), {
      tenant: { organizationId },
    });
    if (!project || project.organizationId !== organizationId) throw HttpError.notFound("Projeto não encontrado.");
    return project;
  }

  async update(organizationId: string, id: string, name: string): Promise<Project> {
    await this.getById(organizationId, id);
    return withTransaction(() => this.projects.update(id, { name, slug: slugify(name) }), { tenant: { organizationId } });
  }

  async remove(organizationId: string, id: string): Promise<void> {
    await this.getById(organizationId, id);
    await withTransaction(() => this.projects.delete(id), { tenant: { organizationId } });
  }
}
