import { Injectable } from "@di/index";
import { KubernetesAdapter } from "@infra/kubernetes/KubernetesAdapter";
import {
  analysisTemplateManifest,
  deploymentManifest,
  hpaManifest,
  ingressManifest,
  ingressNameFor,
  networkPolicyManifest,
  pvcManifest,
  rolloutManifest,
  serviceManifest,
  tlsSecretManifest,
  type TlsModeManifest,
} from "@infra/kubernetes/manifests";
import type { IResourceReconciler, KubeContext, ObservedStatus } from "@interface/integrations";
import type { Application } from "@prisma-generated/client";

export interface AppVolumeSpec {
  name: string;
  mountPath: string;
  sizeGi: number;
  accessMode: "RWO" | "RWX";
}

export interface AppReconcileInput {
  app: Application;
  image: string;
  replicas?: number;
  envVars?: { key: string; value: string }[];
  /** Origens permitidas (grafo de dependências) para a NetworkPolicy. */
  allowedFrom?: string[];
  /** Domínio custom → Ingress (Traefik) + TLS. */
  domain?: string;
  /** Modo TLS do Ingress: lets_encrypt | uploaded | none. */
  tlsMode?: TlsModeManifest;
  /** Certificado enviado (PEM) quando tlsMode = UPLOADED → vira Secret tls. */
  tlsCert?: { cert: string; key: string };
  /** Domínios adicionais (CRUD) → um Ingress por domínio, TLS por domínio. */
  domains?: { host: string; tlsMode: TlsModeManifest; tlsCert?: { cert: string; key: string } }[];
  /** Política de autoscaling → HPA (apenas ROLLING/Deployment). HPA passa a ser o dono das réplicas. */
  scaling?: { minReplicas: number; maxReplicas: number; metric: "CPU" | "MEMORY" | "REQUESTS"; target: number };
  /** Volumes persistentes (PVC) montados nos pods. */
  volumes?: AppVolumeSpec[];
  /** Nome do imagePullSecret (registry privado). */
  imagePullSecret?: string;
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
    const { app, image, replicas = 2, envVars = [], allowedFrom = [], domain, tlsMode = "LETS_ENCRYPT", tlsCert, domains = [], scaling, volumes = [], imagePullSecret } = input;
    // HPA só para ROLLING (Deployment). Quando há autoscaling, o HPA é o dono das réplicas.
    const hpaEnabled = Boolean(scaling) && app.rolloutStrategy === "ROLLING";
    const port = app.port ?? 3000;
    const base = {
      name: app.name,
      namespace: ctx.namespace,
      image,
      port,
      profile: app.profile,
      customResources: app.customResources as Record<string, unknown> | null,
      healthPath: (app.sourceConfig as Record<string, unknown> | null)?.healthPath as string | undefined,
      envVars,
      volumes: volumes.map((v) => ({ name: v.name, mountPath: v.mountPath })),
      imagePullSecret,
    };

    // Volumes persistentes (PVC por volume) antes dos workloads.
    for (const v of volumes) {
      await this.k8s.apply(ctx, pvcManifest(`${app.name}-${v.name}`, ctx.namespace, v.sizeGi, v.accessMode));
    }

    // Isolamento de rede (default-deny + origens do grafo de dependências).
    await this.k8s.apply(ctx, networkPolicyManifest(app.name, ctx.namespace, allowedFrom));

    let status: ObservedStatus;
    if (app.rolloutStrategy === "ROLLING") {
      // Réplicas: HPA ativo → null (HPA é o dono). Senão, se o Deployment já
      // existe, null PRESERVA a escala atual (manual/anterior) — só define o
      // default no primeiro apply. Evita o reconcile resetar o scale manual.
      const exists = Boolean((await this.k8s.observe(ctx, "apps/v1", "Deployment", app.name)).raw);
      await this.k8s.apply(ctx, deploymentManifest(base, hpaEnabled || exists ? null : replicas));
      if (hpaEnabled && scaling) {
        await this.k8s.apply(ctx, hpaManifest(app.name, ctx.namespace, scaling.minReplicas, scaling.maxReplicas, scaling.metric, scaling.target));
      }
      status = await this.k8s.observe(ctx, "apps/v1", "Deployment", app.name);
    } else {
      const cfg = app.rolloutConfig as Record<string, unknown> | null;
      if (cfg?.autoRollback !== false) await this.k8s.apply(ctx, analysisTemplateManifest(app.name, ctx.namespace));
      await this.k8s.apply(ctx, rolloutManifest(base, app.rolloutStrategy, replicas, cfg));
      status = await this.k8s.observe(ctx, "argoproj.io/v1alpha1", "Rollout", app.name);
    }

    // Service encaminha a porta 80 do cluster para a porta ALVO do container.
    await this.k8s.apply(ctx, serviceManifest(app.name, ctx.namespace, port));
    // Domínio primário (legado, sourceConfig.domain) → Ingress nomeado como a app.
    if (domain) {
      // UPLOADED: garante o Secret tls a partir do certificado enviado antes do Ingress.
      if (tlsMode === "UPLOADED" && tlsCert) {
        await this.k8s.apply(ctx, tlsSecretManifest(app.name, ctx.namespace, tlsCert.cert, tlsCert.key));
      }
      await this.k8s.apply(ctx, ingressManifest(app.name, ctx.namespace, domain, tlsMode));
    }

    // Domínios adicionais (CRUD) → um Ingress por domínio, TLS por domínio.
    for (const d of domains) {
      const ingressName = ingressNameFor(app.name, d.host);
      if (d.tlsMode === "UPLOADED" && d.tlsCert) {
        await this.k8s.apply(ctx, tlsSecretManifest(ingressName, ctx.namespace, d.tlsCert.cert, d.tlsCert.key));
      }
      await this.k8s.apply(
        ctx,
        ingressManifest(ingressName, ctx.namespace, d.host, d.tlsMode, { serviceName: app.name, tlsSecretName: `${ingressName}-tls` }),
      );
    }

    return status;
  }

  async destroy(input: AppReconcileInput, ctx: KubeContext): Promise<void> {
    await this.k8s.remove(ctx, "autoscaling/v2", "HorizontalPodAutoscaler", input.app.name).catch(() => undefined);
    await this.k8s.remove(ctx, "networking.k8s.io/v1", "Ingress", input.app.name);
    await this.k8s.remove(ctx, "v1", "Service", input.app.name);
    await this.k8s.remove(ctx, "apps/v1", "Deployment", input.app.name);
    await this.k8s.remove(ctx, "networking.k8s.io/v1", "NetworkPolicy", `${input.app.name}-allow`);
  }
}
