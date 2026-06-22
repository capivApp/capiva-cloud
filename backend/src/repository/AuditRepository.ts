import { Injectable } from "@di/index";
import { BaseRepository } from "@repository/BaseRepository";
import type { Prisma, AuditLog } from "@prisma-generated/client";

@Injectable()
export class AuditRepository extends BaseRepository {
  record(data: Prisma.AuditLogUncheckedCreateInput): Promise<AuditLog> {
    return this.tx.auditLog.create({ data });
  }

  listForUser(userId: string): Promise<AuditLog[]> {
    return this.tx.auditLog.findMany({ where: { userId }, orderBy: { at: "desc" }, take: 100 });
  }

  listByOrganization(organizationId: string, filters: { event?: string; userId?: string } = {}): Promise<AuditLog[]> {
    return this.tx.auditLog.findMany({
      where: {
        organizationId,
        ...(filters.event ? { event: { contains: filters.event } } : {}),
        ...(filters.userId ? { userId: filters.userId } : {}),
      },
      orderBy: { at: "desc" },
      take: 200,
    });
  }
}
