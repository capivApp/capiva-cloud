import type { Request, Response } from "express";
import { Injectable } from "@di/index";
import { NotificationService, NOTIFICATION_EVENTS } from "@service/NotificationService";
import { createNotificationChannelSchema } from "@schemas/notification.schema";
import { tenantOf } from "@functions/tenant";

@Injectable()
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  events = async (_req: Request, res: Response): Promise<void> => {
    res.json(NOTIFICATION_EVENTS);
  };

  list = async (req: Request, res: Response): Promise<void> => {
    const list = await this.notifications.list(tenantOf(req).organizationId);
    res.json(list.map(({ configCipher, ...rest }) => rest));
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const dto = createNotificationChannelSchema.parse(req.body);
    const { configCipher, ...rest } = await this.notifications.create(tenantOf(req).organizationId, dto);
    res.status(201).json(rest);
  };

  test = async (req: Request, res: Response): Promise<void> => {
    await this.notifications.test(tenantOf(req).organizationId, String(req.params.id));
    res.json({ ok: true });
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    await this.notifications.remove(tenantOf(req).organizationId, String(req.params.id));
    res.status(204).end();
  };
}
