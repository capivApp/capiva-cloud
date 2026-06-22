import type { Request, Response } from "express";
import { Injectable } from "@di/index";
import { MembershipService } from "@service/MembershipService";
import { AuditService } from "@service/AuditService";
import { inviteSchema, acceptInviteSchema, changeRoleSchema } from "@schemas/membership.schema";
import { tenantOf } from "@functions/tenant";
import { HttpError } from "@functions/HttpError";

@Injectable()
export class MembershipController {
  constructor(
    private readonly memberships: MembershipService,
    private readonly audit: AuditService,
  ) {}

  listMembers = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.memberships.listMembers(tenantOf(req).organizationId));
  };

  listInvitations = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.memberships.listInvitations(tenantOf(req).organizationId));
  };

  invite = async (req: Request, res: Response): Promise<void> => {
    const dto = inviteSchema.parse(req.body);
    const invite = await this.memberships.invite(tenantOf(req).organizationId, dto.email, dto.role);
    this.audit.fromRequest(req, "member.invite", { targetType: "invitation", targetId: invite.id, detail: `${dto.email} (${dto.role})` });
    // O token é mostrado uma vez (link de convite).
    res.status(201).json({ id: invite.id, email: invite.email, role: invite.role, token: invite.token, expiresAt: invite.expiresAt });
  };

  accept = async (req: Request, res: Response): Promise<void> => {
    if (!req.auth) throw HttpError.unauthorized();
    const { token } = acceptInviteSchema.parse(req.body);
    res.json(await this.memberships.accept(token, req.auth.sub));
  };

  revokeInvitation = async (req: Request, res: Response): Promise<void> => {
    await this.memberships.revokeInvitation(tenantOf(req).organizationId, String(req.params.id));
    res.status(204).end();
  };

  changeRole = async (req: Request, res: Response): Promise<void> => {
    const { role } = changeRoleSchema.parse(req.body);
    const membership = await this.memberships.changeRole(tenantOf(req).organizationId, String(req.params.userId), role);
    this.audit.fromRequest(req, "member.role_change", { targetType: "user", targetId: String(req.params.userId), detail: role });
    res.json(membership);
  };

  removeMember = async (req: Request, res: Response): Promise<void> => {
    await this.memberships.removeMember(tenantOf(req).organizationId, String(req.params.userId));
    this.audit.fromRequest(req, "member.remove", { targetType: "user", targetId: String(req.params.userId) });
    res.status(204).end();
  };
}
