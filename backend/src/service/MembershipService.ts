import crypto from "crypto";
import { Injectable } from "@di/index";
import { OrganizationRepository } from "@repository/OrganizationRepository";
import { InvitationRepository } from "@repository/InvitationRepository";
import { UserRepository } from "@repository/UserRepository";
import { withTransaction } from "@database/withTransaction";
import { HttpError } from "@functions/HttpError";
import type { Invitation, Membership, Role } from "@prisma-generated/client";

export interface MemberView {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: Role;
}

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Membros e convites de uma organização (RBAC). Convites geram um token; ao
 * aceitar, o usuário (logado) vira membro com o papel definido. Mantém ao menos
 * um OWNER por organização.
 */
@Injectable()
export class MembershipService {
  constructor(
    private readonly orgs: OrganizationRepository,
    private readonly invitations: InvitationRepository,
    private readonly users: UserRepository,
  ) {}

  async listMembers(organizationId: string): Promise<MemberView[]> {
    const members = await withTransaction(() => this.orgs.listMembers(organizationId), { tenant: { organizationId } });
    return members.map((m) => ({ userId: m.user.id, name: m.user.name, email: m.user.email, avatarUrl: m.user.avatarUrl, role: m.role }));
  }

  listInvitations(organizationId: string): Promise<Invitation[]> {
    return withTransaction(() => this.invitations.listByOrganization(organizationId), { tenant: { organizationId } });
  }

  /** Cria um convite por email com um papel. Retorna o token (mostrado uma vez). */
  invite(organizationId: string, email: string, role: Role): Promise<Invitation> {
    const token = crypto.randomBytes(24).toString("hex");
    return withTransaction(
      () => this.invitations.create({ organizationId, email, role, token, expiresAt: new Date(Date.now() + INVITE_TTL_MS) }),
      { tenant: { organizationId } },
    );
  }

  /** Aceita um convite (usuário logado vira membro). */
  async accept(token: string, userId: string): Promise<Membership> {
    const invite = await withTransaction(() => this.invitations.findByToken(token), {});
    if (!invite || invite.acceptedAt) throw HttpError.notFound("Convite inválido.");
    if (invite.expiresAt < new Date()) throw HttpError.badRequest("Convite expirado.");
    return withTransaction(async () => {
      const existing = await this.orgs.findMembership(userId, invite.organizationId);
      const membership = existing
        ? await this.orgs.updateMemberRole(userId, invite.organizationId, invite.role)
        : await this.orgs.addMember({ userId, organizationId: invite.organizationId, role: invite.role });
      await this.invitations.markAccepted(invite.id);
      return membership;
    }, { tenant: { organizationId: invite.organizationId } });
  }

  async revokeInvitation(organizationId: string, invitationId: string): Promise<void> {
    const invite = await withTransaction(() => this.invitations.findById(invitationId), { tenant: { organizationId } });
    if (!invite || invite.organizationId !== organizationId) throw HttpError.notFound("Convite não encontrado.");
    await withTransaction(() => this.invitations.delete(invitationId), { tenant: { organizationId } });
  }

  async changeRole(organizationId: string, userId: string, role: Role): Promise<Membership> {
    return withTransaction(async () => {
      const current = await this.orgs.findMembership(userId, organizationId);
      if (!current) throw HttpError.notFound("Membro não encontrado.");
      if (current.role === "OWNER" && role !== "OWNER" && (await this.orgs.countOwners(organizationId)) <= 1) {
        throw HttpError.badRequest("A organização precisa de ao menos um OWNER.");
      }
      return this.orgs.updateMemberRole(userId, organizationId, role);
    }, { tenant: { organizationId } });
  }

  async removeMember(organizationId: string, userId: string): Promise<void> {
    await withTransaction(async () => {
      const current = await this.orgs.findMembership(userId, organizationId);
      if (!current) throw HttpError.notFound("Membro não encontrado.");
      if (current.role === "OWNER" && (await this.orgs.countOwners(organizationId)) <= 1) {
        throw HttpError.badRequest("A organização precisa de ao menos um OWNER.");
      }
      await this.orgs.removeMember(userId, organizationId);
    }, { tenant: { organizationId } });
  }
}
