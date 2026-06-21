import { Injectable } from "@di/index";
import { BaseRepository } from "@repository/BaseRepository";
import type { Prisma, Session } from "@prisma-generated/client";

@Injectable()
export class SessionRepository extends BaseRepository {
  create(data: Prisma.SessionUncheckedCreateInput): Promise<Session> {
    return this.tx.session.create({ data });
  }

  findByTokenHash(tokenHash: string): Promise<Session | null> {
    return this.tx.session.findUnique({ where: { tokenHash } });
  }

  findById(id: string): Promise<Session | null> {
    return this.tx.session.findUnique({ where: { id } });
  }

  update(id: string, data: Prisma.SessionUncheckedUpdateInput): Promise<Session> {
    return this.tx.session.update({ where: { id }, data });
  }

  /** Marca todas as sessões ativas do usuário como revogadas (revogação global). */
  revokeAllForUser(userId: string): Promise<Prisma.BatchPayload> {
    return this.tx.session.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true },
    });
  }

  listActiveForUser(userId: string): Promise<Session[]> {
    return this.tx.session.findMany({
      where: { userId, revoked: false },
      orderBy: { lastUsedAt: "desc" },
    });
  }
}
