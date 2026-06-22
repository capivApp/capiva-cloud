import { Injectable } from "@di/index";
import { BaseRepository } from "@repository/BaseRepository";
import type { Prisma, ScalingMetric, ScalingPolicy } from "@prisma-generated/client";

@Injectable()
export class ScalingPolicyRepository extends BaseRepository {
  findByApplication(applicationId: string): Promise<ScalingPolicy | null> {
    return this.tx.scalingPolicy.findUnique({ where: { applicationId } });
  }

  upsert(data: { applicationId: string; minReplicas: number; maxReplicas: number; metric: ScalingMetric; target: number }): Promise<ScalingPolicy> {
    const payload: Prisma.ScalingPolicyUncheckedCreateInput = data;
    return this.tx.scalingPolicy.upsert({
      where: { applicationId: data.applicationId },
      create: payload,
      update: { minReplicas: data.minReplicas, maxReplicas: data.maxReplicas, metric: data.metric, target: data.target },
    });
  }

  deleteByApplication(applicationId: string): Promise<Prisma.BatchPayload> {
    return this.tx.scalingPolicy.deleteMany({ where: { applicationId } });
  }
}
