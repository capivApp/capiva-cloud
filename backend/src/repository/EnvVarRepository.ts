import { Injectable } from "@di/index";
import { BaseRepository } from "@repository/BaseRepository";
import type { EnvVar, Prisma } from "@prisma-generated/client";

@Injectable()
export class EnvVarRepository extends BaseRepository {
  listByApplication(applicationId: string): Promise<EnvVar[]> {
    return this.tx.envVar.findMany({ where: { applicationId }, orderBy: { key: "asc" } });
  }

  /** Upsert por (applicationId, key) — usado por manual e injeção de dependências. */
  upsert(data: { applicationId: string; key: string; value: string; secret?: boolean; source?: "MANUAL" | "INJECTED" }): Promise<EnvVar> {
    const payload: Prisma.EnvVarUncheckedCreateInput = {
      applicationId: data.applicationId,
      key: data.key,
      value: data.value,
      secret: data.secret ?? false,
      source: data.source ?? "MANUAL",
    };
    return this.tx.envVar.upsert({
      where: { applicationId_key: { applicationId: data.applicationId, key: data.key } },
      create: payload,
      update: { value: data.value, secret: payload.secret, source: payload.source },
    });
  }

  delete(applicationId: string, key: string): Promise<EnvVar> {
    return this.tx.envVar.delete({ where: { applicationId_key: { applicationId, key } } });
  }
}
