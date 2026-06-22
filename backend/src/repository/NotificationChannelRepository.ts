import { Injectable } from "@di/index";
import { BaseRepository } from "@repository/BaseRepository";
import type { NotificationChannel, Prisma } from "@prisma-generated/client";

@Injectable()
export class NotificationChannelRepository extends BaseRepository {
  create(data: Prisma.NotificationChannelUncheckedCreateInput): Promise<NotificationChannel> {
    return this.tx.notificationChannel.create({ data });
  }

  listByOrganization(organizationId: string): Promise<NotificationChannel[]> {
    return this.tx.notificationChannel.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" } });
  }

  listEnabledForEvent(organizationId: string): Promise<NotificationChannel[]> {
    return this.tx.notificationChannel.findMany({ where: { organizationId, enabled: true } });
  }

  findById(id: string): Promise<NotificationChannel | null> {
    return this.tx.notificationChannel.findUnique({ where: { id } });
  }

  update(id: string, data: Prisma.NotificationChannelUncheckedUpdateInput): Promise<NotificationChannel> {
    return this.tx.notificationChannel.update({ where: { id }, data });
  }

  delete(id: string): Promise<NotificationChannel> {
    return this.tx.notificationChannel.delete({ where: { id } });
  }
}
