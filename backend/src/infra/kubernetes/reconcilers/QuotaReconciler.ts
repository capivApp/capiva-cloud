import { Injectable } from "@di/index";
import { KubernetesAdapter } from "@infra/kubernetes/KubernetesAdapter";
import {
  LIMIT_RANGE_NAME,
  RESOURCE_QUOTA_NAME,
  limitRangeManifest,
  resourceQuotaManifest,
} from "@infra/kubernetes/quotaManifests";
import type { QuotaLimite } from "@functions/finops/quota";
import type { IResourceReconciler, KubeContext, ObservedStatus } from "@interface/integrations";

/**
 * Strategy de reconciliação da quota do ambiente: ResourceQuota + LimitRange no
 * namespace. Sem limite algum, os dois saem do cluster.
 */
@Injectable()
export class QuotaReconciler implements IResourceReconciler<{ limite: QuotaLimite }> {
  constructor(private readonly k8s: KubernetesAdapter) {}

  async reconcile({ limite }: { limite: QuotaLimite }, ctx: KubeContext): Promise<ObservedStatus> {
    const quota = resourceQuotaManifest(ctx.namespace, limite);
    if (!quota) {
      await this.destroy({ limite }, ctx);
      return { ready: true, message: "Sem quota." };
    }
    await this.k8s.apply(ctx, limitRangeManifest(ctx.namespace));
    await this.k8s.apply(ctx, quota);
    return { ready: true };
  }

  async destroy(_entity: { limite: QuotaLimite }, ctx: KubeContext): Promise<void> {
    await this.k8s.remove(ctx, "v1", "ResourceQuota", RESOURCE_QUOTA_NAME);
    await this.k8s.remove(ctx, "v1", "LimitRange", LIMIT_RANGE_NAME);
  }
}
