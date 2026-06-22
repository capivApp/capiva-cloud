import { Injectable } from "@di/index";
import { NotificationChannelRepository } from "@repository/NotificationChannelRepository";
import { notificationAdapterFor, type NotificationMessage } from "@infra/notifications/adapters";
import { withTransaction } from "@database/withTransaction";
import { encrypt, decrypt } from "@functions/crypto";
import { HttpError } from "@functions/HttpError";
import type { NotificationChannel, NotificationType } from "@prisma-generated/client";

export interface CreateChannelInput {
  type: NotificationType;
  name: string;
  config: Record<string, unknown>;
  events: string[];
  enabled?: boolean;
}

/** Eventos que disparam notificações (cada canal escolhe quais escuta). */
export const NOTIFICATION_EVENTS = ["deploy.succeeded", "deploy.failed", "deploy.rollback", "downtime", "recovery"] as const;

/**
 * Notificações: N canais por organização (vários do mesmo tipo, cada um com
 * seus próprios eventos). Config cifrada. `dispatch` envia para todos os canais
 * habilitados que escutam o evento (best-effort, nunca derruba o fluxo).
 */
@Injectable()
export class NotificationService {
  constructor(private readonly channels: NotificationChannelRepository) {}

  list(organizationId: string): Promise<NotificationChannel[]> {
    return withTransaction(() => this.channels.listByOrganization(organizationId), { tenant: { organizationId } });
  }

  create(organizationId: string, input: CreateChannelInput): Promise<NotificationChannel> {
    return withTransaction(
      () =>
        this.channels.create({
          organizationId,
          type: input.type,
          name: input.name,
          configCipher: encrypt(JSON.stringify(input.config)),
          events: input.events,
          enabled: input.enabled ?? true,
        }),
      { tenant: { organizationId } },
    );
  }

  async getById(organizationId: string, id: string): Promise<NotificationChannel> {
    const channel = await withTransaction(() => this.channels.findById(id), { tenant: { organizationId } });
    if (!channel || channel.organizationId !== organizationId) throw HttpError.notFound("Canal não encontrado.");
    return channel;
  }

  async remove(organizationId: string, id: string): Promise<void> {
    await this.getById(organizationId, id);
    await withTransaction(() => this.channels.delete(id), { tenant: { organizationId } });
  }

  /** Envia uma mensagem de teste por um canal específico. */
  async test(organizationId: string, id: string): Promise<void> {
    const channel = await this.getById(organizationId, id);
    await this.deliver(channel, { event: "test", title: "Capiva Cloud", body: `Canal "${channel.name}" configurado com sucesso. ✅` });
  }

  /**
   * Dispara um evento para todos os canais habilitados que o escutam.
   * Best-effort e assíncrono — falhas de entrega não afetam o chamador.
   */
  async dispatch(organizationId: string, message: NotificationMessage): Promise<void> {
    const channels = await withTransaction(() => this.channels.listEnabledForEvent(organizationId), { tenant: { organizationId } }).catch(() => []);
    const targets = channels.filter((c) => (c.events as string[]).includes(message.event));
    await Promise.all(targets.map((c) => this.deliver(c, message).catch((e) => console.error(`[notify] ${c.type} falhou:`, (e as Error).message))));
  }

  private async deliver(channel: NotificationChannel, message: NotificationMessage): Promise<void> {
    const config = JSON.parse(decrypt(channel.configCipher)) as Record<string, unknown>;
    await notificationAdapterFor(channel.type).send(config, message);
  }
}
