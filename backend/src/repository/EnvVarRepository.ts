import { Injectable } from "@di/index";
import { BaseRepository } from "@repository/BaseRepository";
import type { EnvVar, Prisma } from "@prisma-generated/client";

@Injectable()
export class EnvVarRepository extends BaseRepository {
  listByApplication(applicationId: string): Promise<EnvVar[]> {
    return this.tx.envVar.findMany({
      where: { applicationId, ...this.scope("envVar") },
      orderBy: { key: "asc" },
    });
  }

  /** Confirma que a aplicação alvo pertence à organização ativa. */
  private async assertApplication(applicationId: string): Promise<void> {
    await this.ensureScoped(
      () =>
        this.tx.application.findFirst({
          where: { id: applicationId, ...this.scope("application") },
        }),
      "Aplicação",
    );
  }

  /** Upsert por (applicationId, key) — usado por manual e injeção de dependências. */
  async upsert(data: {
    applicationId: string;
    key: string;
    value: string;
    secret?: boolean;
    source?: EnvVar["source"];
    secretStoreId?: string | null;
    remoteProperty?: string | null;
  }): Promise<EnvVar> {
    await this.assertApplication(data.applicationId);
    const payload: Prisma.EnvVarUncheckedCreateInput = {
      applicationId: data.applicationId,
      key: data.key,
      value: data.value,
      secret: data.secret ?? false,
      source: data.source ?? "MANUAL",
      secretStoreId: data.secretStoreId ?? null,
      remoteProperty: data.remoteProperty ?? null,
    };
    return this.tx.envVar.upsert({
      where: { applicationId_key: { applicationId: data.applicationId, key: data.key } },
      create: payload,
      update: {
        value: data.value,
        secret: payload.secret,
        source: payload.source,
        secretStoreId: payload.secretStoreId,
        remoteProperty: payload.remoteProperty,
      },
    });
  }

  async delete(applicationId: string, key: string): Promise<EnvVar> {
    await this.assertApplication(applicationId);
    return this.tx.envVar.delete({ where: { applicationId_key: { applicationId, key } } });
  }
}
