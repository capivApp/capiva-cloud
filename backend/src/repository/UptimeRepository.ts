import { Injectable } from "@di/index";
import { BaseRepository } from "@repository/BaseRepository";
import type { Prisma, UptimeCheck, UptimeResult } from "@prisma-generated/client";

/** Dono da verificação: a notificação precisa do nome da app e da organização. */
const INCLUDE_OWNER = {
  application: { select: { name: true, project: { select: { organizationId: true } } } },
} satisfies Prisma.UptimeCheckInclude;

export type UptimeCheckWithOwner = Prisma.UptimeCheckGetPayload<{ include: typeof INCLUDE_OWNER }>;

@Injectable()
export class UptimeRepository extends BaseRepository {
  async createCheck(data: Prisma.UptimeCheckUncheckedCreateInput): Promise<UptimeCheck> {
    await this.ensureScoped(
      () =>
        this.tx.application.findFirst({
          where: { id: data.applicationId, ...this.scope("application") },
        }),
      "Aplicação",
    );
    return this.tx.uptimeCheck.create({ data });
  }

  listChecks(applicationId: string): Promise<UptimeCheck[]> {
    return this.tx.uptimeCheck.findMany({
      where: { applicationId, ...this.scope("uptimeCheck") },
      orderBy: { createdAt: "asc" },
    });
  }

  findCheck(id: string): Promise<UptimeCheckWithOwner | null> {
    return this.tx.uptimeCheck.findFirst({
      where: { id, ...this.scope("uptimeCheck") },
      include: INCLUDE_OWNER,
    });
  }

  async deleteCheck(id: string): Promise<UptimeCheck> {
    await this.ensureScoped(() => this.findCheck(id), "Verificação");
    return this.tx.uptimeCheck.delete({ where: { id } });
  }

  /**
   * Todas as verificações habilitadas (scheduler da plataforma). Roda fora de
   * tenant de propósito — varre todas as organizações.
   */
  listEnabled(): Promise<UptimeCheckWithOwner[]> {
    return this.tx.uptimeCheck.findMany({ where: { enabled: true }, include: INCLUDE_OWNER });
  }

  recordResult(data: Prisma.UptimeResultUncheckedCreateInput): Promise<UptimeResult> {
    return this.tx.uptimeResult.create({ data });
  }

  recentResults(uptimeCheckId: string, take = 200): Promise<UptimeResult[]> {
    return this.tx.uptimeResult.findMany({
      where: { uptimeCheckId },
      orderBy: { at: "desc" },
      take,
    });
  }
}
