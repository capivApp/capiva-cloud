import { Injectable } from "@di/index";
import { KubernetesAdapter } from "@infra/kubernetes/KubernetesAdapter";
import {
  analysisTemplateManifest,
  deploymentManifest,
  ingressManifest,
  networkPolicyManifest,
  rolloutManifest,
  serviceManifest,
} from "@infra/kubernetes/manifests";
import type { IResourceReconciler, KubeContext, ObservedStatus } from "@interface/integrations";
import type { Application } from "@prisma-generated/client";

export interface AppReconcileInput {
  app: Application;
  image: string;
  replicas?: number;
  envVars?: { key: string; value: string }[];
  /** Origens permitidas (grafo de dependências) para a NetworkPolicy. */
  allowedFrom?: string[];
  /** Domínio custom → HTTPRoute (Gateway API) + TLS automático. */
  domain?: string;
}

/**
 * Strategy de reconciliação de Aplicação: traduz a entidade nos recursos
 * Kubernetes escondidos (Deployment/Rollout + Service + NetworkPolicy + HTTPRoute).
 * Tudo idempotente (server-side apply).
 */
@Injectable()
export class ApplicationReconciler implements IResourceReconciler<AppReconcileInput> {
  constructor(private readonly k8s: KubernetesAdapter) {}

  async reconcile(input: AppReconcileInput, ctx: KubeContext): Promise<ObservedStatus> {
    const { app, image, replicas = 2, envVars = [], allowedFrom = [], domain } = input;
    const port = app.port ?? 3000;
    const base = {
      name: app.name,
      namespace: ctx.namespace,
      image,
      port,
      profile: app.profile,
      customResources: app.customResources as Record<string, unknown> | null,
      envVars,
    };

    // Isolamento de rede (default-deny + origens do grafo de dependências).
    await this.k8s.apply(ctx, networkPolicyManifest(app.name, ctx.namespace, allowedFrom));

    let status: ObservedStatus;
    if (app.rolloutStrategy === "ROLLING") {
      await this.k8s.apply(ctx, deploymentManifest(base, replicas));
      status = await this.k8s.observe(ctx, "apps/v1", "Deployment", app.name);
    } else {
      const cfg = app.rolloutConfig as Record<string, unknown> | null;
      if (cfg?.autoRollback !== false) await this.k8s.apply(ctx, analysisTemplateManifest(app.name, ctx.namespace));
      await this.k8s.apply(ctx, rolloutManifest(base, app.rolloutStrategy, replicas, cfg));
      status = await this.k8s.observe(ctx, "argoproj.io/v1alpha1", "Rollout", app.name);
    }

    // Service encaminha a porta 80 do cluster para a porta ALVO do container.
    await this.k8s.apply(ctx, serviceManifest(app.name, ctx.namespace, port));
    // Domínio custom → Ingress (Traefik) + TLS automático (cert-manager).
    if (domain) await this.k8s.apply(ctx, ingressManifest(app.name, ctx.namespace, domain));

    return status;
  }

  async destroy(input: AppReconcileInput, ctx: KubeContext): Promise<void> {
    await this.k8s.remove(ctx, "networking.k8s.io/v1", "Ingress", input.app.name);
    await this.k8s.remove(ctx, "v1", "Service", input.app.name);
    await this.k8s.remove(ctx, "apps/v1", "Deployment", input.app.name);
    await this.k8s.remove(ctx, "networking.k8s.io/v1", "NetworkPolicy", `${input.app.name}-allow`);
  }
}
