import { Injectable } from "@di/index";
import { ScalingPolicyRepository } from "@repository/ScalingPolicyRepository";
import { ApplicationService } from "@service/ApplicationService";
import { KubeContextResolver } from "@service/KubeContextResolver";
import { KubernetesAdapter } from "@infra/kubernetes/KubernetesAdapter";
import { withTransaction } from "@database/withTransaction";
import { HttpError } from "@functions/HttpError";
import type { HpaLiveStatus } from "@interface/integrations";
import type { ScalingMetric, ScalingPolicy } from "@prisma-generated/client";

export interface SetScalingInput {
  minReplicas: number;
  maxReplicas: number;
  metric: ScalingMetric;
  target: number;
}

export interface ScalingStatus {
  policy: ScalingPolicy | null;
  /** HPA vivo (réplicas, métrica, alvo, condições) quando há autoscaling ativo. */
  hpa: HpaLiveStatus;
  /** Réplicas atuais observadas (HPA ou Deployment). */
  currentReplicas: number;
  autoscalerActive: boolean;
}

/**
 * Autoscaling (HPA) das aplicações: política (min/max/métrica/alvo), aplicação
 * via reconcile, observabilidade do estado vivo e escala manual de réplicas.
 */
@Injectable()
export class ScalingService {
  constructor(
    private readonly policies: ScalingPolicyRepository,
    private readonly apps: ApplicationService,
    private readonly kube: KubeContextResolver,
    private readonly k8s: KubernetesAdapter,
  ) {}

  getPolicy(applicationId: string, tenant: { organizationId: string }): Promise<ScalingPolicy | null> {
    return withTransaction(() => this.policies.findByApplication(applicationId), { tenant });
  }

  /** Define/atualiza a política e reconcilia (aplica o HPA). Só vale para ROLLING. */
  async setPolicy(applicationId: string, input: SetScalingInput, tenant: { organizationId: string }): Promise<ScalingPolicy> {
    const app = await this.apps.getById(applicationId, tenant);
    if (app.rolloutStrategy !== "ROLLING") {
      throw HttpError.badRequest("Autoscaling (HPA) disponível apenas para estratégia ROLLING.");
    }
    if (input.maxReplicas < input.minReplicas) throw HttpError.badRequest("maxReplicas deve ser ≥ minReplicas.");

    const policy = await withTransaction(
      () => this.policies.upsert({ applicationId, minReplicas: input.minReplicas, maxReplicas: input.maxReplicas, metric: input.metric, target: input.target }),
      { tenant },
    );
    await this.apps.reconcile(app, tenant).catch((e) => console.error("[scaling] reconcile:", (e as Error).message));
    return policy;
  }

  /** Desativa o autoscaling: remove a política e o HPA, e reconcilia (volta a réplicas fixas). */
  async disable(applicationId: string, tenant: { organizationId: string }): Promise<void> {
    const app = await this.apps.getById(applicationId, tenant);
    await withTransaction(() => this.policies.deleteByApplication(applicationId), { tenant });
    try {
      const ctx = await this.kube.forEnvironment(app.environmentId, tenant);
      if (ctx.kubeconfig) await this.k8s.remove(ctx, "autoscaling/v2", "HorizontalPodAutoscaler", app.name);
    } catch (e) {
      console.error("[scaling] remove hpa:", (e as Error).message);
    }
    await this.apps.reconcile(app, tenant).catch((e) => console.error("[scaling] reconcile:", (e as Error).message));
  }

  /** Estado vivo do autoscaling (observabilidade). */
  async status(applicationId: string, tenant: { organizationId: string }): Promise<ScalingStatus> {
    const app = await this.apps.getById(applicationId, tenant);
    const policy = await withTransaction(() => this.policies.findByApplication(applicationId), { tenant });
    const ctx = await this.kube.forEnvironment(app.environmentId, tenant);

    const hpa = ctx.kubeconfig ? await this.k8s.getHpaStatus(ctx, app.name) : { exists: false };
    let currentReplicas = hpa.currentReplicas ?? 0;
    if (!hpa.exists && ctx.kubeconfig) {
      const obs = await this.k8s.observe(ctx, "apps/v1", "Deployment", app.name);
      currentReplicas = obs.replicas ?? 0;
    }
    return { policy, hpa, currentReplicas, autoscalerActive: hpa.exists };
  }

  /**
   * Escala manualmente o Deployment. Se houver HPA ativo, ele pode sobrescrever
   * (o chamador deve avisar / oferecer desativar o autoscaling).
   */
  async scaleManually(applicationId: string, replicas: number, tenant: { organizationId: string }): Promise<{ replicas: number; autoscalerActive: boolean }> {
    if (!Number.isInteger(replicas) || replicas < 0 || replicas > 100) throw HttpError.badRequest("Número de réplicas inválido (0–100).");
    const app = await this.apps.getById(applicationId, tenant);
    const ctx = await this.kube.forEnvironment(app.environmentId, tenant);
    if (!ctx.kubeconfig) throw HttpError.badRequest("Ambiente sem cluster configurado.");

    await this.k8s.scaleDeployment(ctx, app.name, replicas);
    const policy = await withTransaction(() => this.policies.findByApplication(applicationId), { tenant });
    return { replicas, autoscalerActive: Boolean(policy) };
  }
}
