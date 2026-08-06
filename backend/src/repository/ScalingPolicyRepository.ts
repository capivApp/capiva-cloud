import { Injectable } from "@di/index";
import { BaseRepository } from "@repository/BaseRepository";
import type { Prisma, ScalingMetric, ScalingPolicy } from "@prisma-generated/client";

@Injectable()
export class ScalingPolicyRepository extends BaseRepository {
  findByApplication(applicationId: string): Promise<ScalingPolicy | null> {
    return this.tx.scalingPolicy.findFirst({ where: { applicationId, ...this.scope("scalingPolicy") } });
  }

  /** Confirma que a aplicação alvo pertence à organização ativa. */
  private async assertApplication(applicationId: string): Promise<void> {
    await this.ensureScoped(
      () => this.tx.application.findFirst({ where: { id: applicationId, ...this.scope("application") } }),
      "Aplicação",
    );
  }

  async upsert(data: { applicationId: string; minReplicas: number; maxReplicas: number; metric: ScalingMetric; target: number }): Promise<ScalingPolicy> {
    await this.assertApplication(data.applicationId);
    const payload: Prisma.ScalingPolicyUncheckedCreateInput = data;
    return this.tx.scalingPolicy.upsert({
      where: { applicationId: data.applicationId },
      create: payload,
      update: { minReplicas: data.minReplicas, maxReplicas: data.maxReplicas, metric: data.metric, target: data.target },
    });
  }

  deleteByApplication(applicationId: string): Promise<Prisma.BatchPayload> {
    return this.tx.scalingPolicy.deleteMany({ where: { applicationId, ...this.scope("scalingPolicy") } });
  }
}
