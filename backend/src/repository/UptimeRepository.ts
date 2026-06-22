import { Injectable } from "@di/index";
import { BaseRepository } from "@repository/BaseRepository";
import type { Prisma, UptimeCheck, UptimeResult } from "@prisma-generated/client";

@Injectable()
export class UptimeRepository extends BaseRepository {
  createCheck(data: Prisma.UptimeCheckUncheckedCreateInput): Promise<UptimeCheck> {
    return this.tx.uptimeCheck.create({ data });
  }

  listChecks(applicationId: string): Promise<UptimeCheck[]> {
    return this.tx.uptimeCheck.findMany({ where: { applicationId }, orderBy: { createdAt: "asc" } });
  }

  findCheck(id: string): Promise<UptimeCheck | null> {
    return this.tx.uptimeCheck.findUnique({ where: { id } });
  }

  deleteCheck(id: string): Promise<UptimeCheck> {
    return this.tx.uptimeCheck.delete({ where: { id } });
  }

  /** Todas as verificações habilitadas (para o scheduler). Sem filtro de tenant. */
  listEnabled(): Promise<UptimeCheck[]> {
    return this.tx.uptimeCheck.findMany({ where: { enabled: true } });
  }

  recordResult(data: Prisma.UptimeResultUncheckedCreateInput): Promise<UptimeResult> {
    return this.tx.uptimeResult.create({ data });
  }

  recentResults(uptimeCheckId: string, take = 200): Promise<UptimeResult[]> {
    return this.tx.uptimeResult.findMany({ where: { uptimeCheckId }, orderBy: { at: "desc" }, take });
  }
}
