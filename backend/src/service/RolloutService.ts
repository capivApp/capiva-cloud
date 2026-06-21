import { Injectable } from "@di/index";
import { ApplicationRepository } from "@repository/ApplicationRepository";
import { KubernetesAdapter } from "@infra/kubernetes/KubernetesAdapter";
import { KubeContextResolver } from "@service/KubeContextResolver";
import { ApplicationService } from "@service/ApplicationService";
import { withTransaction } from "@database/withTransaction";
import { HttpError } from "@functions/HttpError";
import type { Application, Prisma, RolloutStrategy } from "@prisma-generated/client";

export interface RolloutConfig {
  initialTraffic?: number;
  increment?: number;
  intervalMinutes?: number;
  autoRollback?: boolean;
}

/**
 * Regras de estratégia de deploy (Rolling/Blue-Green/Canary) e ações de rollout.
 * Esconde o Argo Rollouts: o usuário só escolhe a estratégia e campos simples.
 */
@Injectable()
export class RolloutService {
  constructor(
    private readonly apps: ApplicationRepository,
    private readonly appService: ApplicationService,
    private readonly kube: KubeContextResolver,
    private readonly k8s: KubernetesAdapter,
  ) {}

  async updateStrategy(
    id: string,
    strategy: RolloutStrategy,
    config: RolloutConfig,
    tenant: { organizationId: string },
  ): Promise<Application> {
    const app = await withTransaction(
      () =>
        this.apps.update(id, {
          rolloutStrategy: strategy,
          rolloutConfig: config as Prisma.InputJsonValue,
        }),
      { tenant },
    );
    await this.appService.reconcile(app, tenant); // re-aplica com a nova estratégia
    return app;
  }

  /** Promove (conclui) um rollout em andamento — annotation entendida pelo Argo. */
  async promote(id: string, tenant: { organizationId: string }): Promise<void> {
    const app = await this.appService.getById(id, tenant);
    const ctx = await this.kube.forEnvironment(app.environmentId, tenant);
    if (app.rolloutStrategy === "ROLLING") throw HttpError.badRequest("Estratégia Rolling não suporta promote.");
    await this.k8s.apply(ctx, {
      apiVersion: "argoproj.io/v1alpha1",
      kind: "Rollout",
      metadata: {
        name: app.name,
        namespace: ctx.namespace,
        annotations: { "rollout.argoproj.io/promote-full": "true" },
      },
    });
  }
}
