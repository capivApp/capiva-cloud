import { Injectable } from "@di/index";
import { BaseRepository } from "@repository/BaseRepository";
import type { Prisma, Organization, Membership, Role } from "@prisma-generated/client";

@Injectable()
export class OrganizationRepository extends BaseRepository {
  create(data: Prisma.OrganizationCreateInput): Promise<Organization> {
    return this.tx.organization.create({ data });
  }

  findBySlug(slug: string): Promise<Organization | null> {
    return this.tx.organization.findUnique({ where: { slug } });
  }

  listForUser(userId: string): Promise<Organization[]> {
    return this.tx.organization.findMany({
      where: { memberships: { some: { userId } } },
      orderBy: { createdAt: "asc" },
    });
  }

  addMember(data: Prisma.MembershipUncheckedCreateInput): Promise<Membership> {
    return this.tx.membership.create({ data });
  }

  findMembership(userId: string, organizationId: string): Promise<Membership | null> {
    return this.tx.membership.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
    });
  }

  roleOf(userId: string, organizationId: string): Promise<Role | undefined> {
    return this.findMembership(userId, organizationId).then((m) => m?.role);
  }
}
