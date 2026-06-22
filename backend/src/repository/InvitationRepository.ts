import { Injectable } from "@di/index";
import { BaseRepository } from "@repository/BaseRepository";
import type { Invitation, Prisma } from "@prisma-generated/client";

@Injectable()
export class InvitationRepository extends BaseRepository {
  create(data: Prisma.InvitationUncheckedCreateInput): Promise<Invitation> {
    return this.tx.invitation.create({ data });
  }

  listByOrganization(organizationId: string): Promise<Invitation[]> {
    return this.tx.invitation.findMany({ where: { organizationId, acceptedAt: null }, orderBy: { createdAt: "desc" } });
  }

  findByToken(token: string): Promise<Invitation | null> {
    return this.tx.invitation.findUnique({ where: { token } });
  }

  findById(id: string): Promise<Invitation | null> {
    return this.tx.invitation.findUnique({ where: { id } });
  }

  markAccepted(id: string): Promise<Invitation> {
    return this.tx.invitation.update({ where: { id }, data: { acceptedAt: new Date() } });
  }

  delete(id: string): Promise<Invitation> {
    return this.tx.invitation.delete({ where: { id } });
  }
}
