import { Injectable } from "@di/index";
import { OrganizationRepository } from "@repository/OrganizationRepository";
import { withTransaction } from "@database/withTransaction";
import { HttpError } from "@functions/HttpError";
import type { Organization, Role } from "@prisma-generated/client";

/** Regras de organização e autorização de papéis (RBAC). */
@Injectable()
export class OrganizationService {
  constructor(private readonly orgs: OrganizationRepository) {}

  listForUser(userId: string): Promise<Organization[]> {
    return withTransaction(() => this.orgs.listForUser(userId));
  }

  create(userId: string, name: string): Promise<Organization> {
    return withTransaction(async () => {
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      if (await this.orgs.findBySlug(slug)) throw HttpError.conflict("Slug já existe.");
      const org = await this.orgs.create({ name, slug });
      await this.orgs.addMember({ userId, organizationId: org.id, role: "OWNER" });
      return org;
    });
  }

  /** Verifica se o usuário tem ao menos o papel exigido na organização. */
  async assertRole(userId: string, organizationId: string, minimum: Role): Promise<void> {
    const order: Role[] = ["VIEWER", "DEVELOPER", "ADMIN", "OWNER"];
    await withTransaction(async () => {
      const role = await this.orgs.roleOf(userId, organizationId);
      if (!role || order.indexOf(role) < order.indexOf(minimum)) {
        throw HttpError.forbidden("Permissão insuficiente nesta organização.");
      }
    });
  }
}
