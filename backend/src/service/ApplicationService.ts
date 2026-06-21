import { Injectable } from "@di/index";
import { ApplicationRepository } from "@repository/ApplicationRepository";
import { EnvVarRepository } from "@repository/EnvVarRepository";
import { ServiceDependencyRepository } from "@repository/ServiceDependencyRepository";
import { ReconcilerFactory } from "@infra/kubernetes/ReconcilerFactory";
import { KubernetesAdapter } from "@infra/kubernetes/KubernetesAdapter";
import { KubeContextResolver } from "@service/KubeContextResolver";
import { withTransaction } from "@database/withTransaction";
import { decrypt } from "@functions/crypto";
import { HttpError } from "@functions/HttpError";
import type { Application, Prisma } from "@prisma-generated/client";

export interface CreateApplicationInput {
  projectId: string;
  environmentId: string;
  name: string;
  source: Application["source"];
  sourceConfig: Record<string, unknown>;
  profile?: Application["profile"];
  rolloutStrategy?: Application["rolloutStrategy"];
  port?: number;
  /** Variáveis de runtime (vão para o container). */
  env?: { key: string; value: string }[];
  /** Variáveis de build (build args). */
  buildArgs?: { key: string; value: string }[];
  tags?: string[];
}

/**
 * Regras de aplicação: cria a entidade (estado desejado), reconcilia para o
 * cluster e gerencia o ciclo de vida (stop/restart/remove). O usuário nunca vê
 * Deployment/Service/Ingress — só a abstração "aplicação".
 */
@Injectable()
export class ApplicationService {
  constructor(
    private readonly apps: ApplicationRepository,
    private readonly envVars: EnvVarRepository,
    private readonly deps: ServiceDependencyRepository,
    private readonly reconcilers: ReconcilerFactory,
    private readonly kube: KubeContextResolver,
    private readonly k8s: KubernetesAdapter,
  ) {}

  listByProject(projectId: string, tenant: { organizationId: string }): Promise<Application[]> {
    return withTransaction(() => this.apps.listByProject(projectId), { tenant });
  }

  async create(input: CreateApplicationInput, tenant: { organizationId: string }): Promise<Application> {
    // Build args ficam no sourceConfig (usados pelo builder); envs de runtime viram EnvVar.
    const sourceConfig = { ...input.sourceConfig, buildArgs: input.buildArgs ?? [] };

    const app = await withTransaction(
      async () => {
        const created = await this.apps.create({
          projectId: input.projectId,
          environmentId: input.environmentId,
          name: input.name,
          source: input.source,
          sourceConfig: sourceConfig as Prisma.InputJsonValue,
          tags: (input.tags ?? []) as Prisma.InputJsonValue,
          profile: input.profile ?? "SMALL",
          rolloutStrategy: input.rolloutStrategy ?? "ROLLING",
          port: input.port ?? 3000,
        });
        for (const e of input.env ?? []) {
          if (e.key.trim()) await this.envVars.upsert({ applicationId: created.id, key: e.key, value: e.value, source: "MANUAL" });
        }
        return created;
      },
      { tenant },
    );
    // Reconciliação não-fatal na criação: recursos faltantes (ex.: CRD do Argo
    // Rollouts) não devem impedir a criação — o status reflete o estado.
    try {
      await this.reconcile(app, tenant);
    } catch (error) {
      console.error("[app] reconcile falhou na criação:", (error as Error).message);
      await withTransaction(() => this.apps.updateStatus(app.id, "error"), { tenant });
    }
    return app;
  }

  /** Reconcilia a aplicação (idempotente). Atualiza o estado observado. */
  async reconcile(app: Application, tenant: { organizationId: string }, replicas = 2): Promise<void> {
    const ctx = await this.kube.forEnvironment(app.environmentId, tenant);
    const cfg = app.sourceConfig as Record<string, unknown>;
    const image = (cfg?.image as string) ?? "ghcr.io/capiva/placeholder:latest";
    const domain = cfg?.domain as string | undefined;

    const [envVars, deps] = await withTransaction(
      async () => [await this.envVars.listByApplication(app.id), await this.deps.listForApplication(app.id)] as const,
      { tenant },
    );
    const resolvedEnv = envVars.map((e) => ({ key: e.key, value: e.secret ? safeDecrypt(e.value) : e.value }));

    // Origens que dependem desta app (target == app) → liberadas na NetworkPolicy.
    const allowedSourceIds = deps.filter((d) => d.targetId === app.id).map((d) => d.sourceId);
    const allowedFrom = await withTransaction(
      async () => (await Promise.all(allowedSourceIds.map((id) => this.apps.findById(id)))).flatMap((a) => (a ? [a.name] : [])),
      { tenant },
    );

    const status = await this.reconcilers.forApplication().reconcile(
      { app, image, replicas, envVars: resolvedEnv, allowedFrom, domain },
      ctx,
    );
    await withTransaction(() => this.apps.updateStatus(app.id, status.ready ? "running" : "progressing"), { tenant });
  }

  async getById(id: string, tenant: { organizationId: string }): Promise<Application> {
    const app = await withTransaction(() => this.apps.findById(id), { tenant });
    if (!app) throw HttpError.notFound("Aplicação não encontrada.");
    return app;
  }

  async updateTags(id: string, tags: string[], tenant: { organizationId: string }): Promise<Application> {
    await this.getById(id, tenant);
    return withTransaction(() => this.apps.update(id, { tags: tags as Prisma.InputJsonValue }), { tenant });
  }

  /** Para a aplicação (escala para 0 réplicas). */
  async stop(id: string, tenant: { organizationId: string }): Promise<Application> {
    const app = await this.getById(id, tenant);
    await this.reconcile(app, tenant, 0);
    return withTransaction(() => this.apps.update(id, { desiredStatus: "stopped", observedStatus: "stopped" }), { tenant });
  }

  /** Inicia a aplicação novamente. */
  async start(id: string, tenant: { organizationId: string }): Promise<Application> {
    const app = await this.getById(id, tenant);
    await this.reconcile(app, tenant, 2);
    return withTransaction(() => this.apps.update(id, { desiredStatus: "running" }), { tenant });
  }

  /** Reinicia os pods (rollout restart via annotation de template). */
  async restart(id: string, tenant: { organizationId: string }): Promise<void> {
    const app = await this.getById(id, tenant);
    const ctx = await this.kube.forEnvironment(app.environmentId, tenant);
    await this.k8s.apply(ctx, {
      apiVersion: "apps/v1",
      kind: "Deployment",
      metadata: { name: app.name, namespace: ctx.namespace },
      spec: { template: { metadata: { annotations: { "capiva.cloud/restartedAt": new Date().toISOString() } } } },
    });
  }

  /** Remove a aplicação e seus recursos no cluster. */
  async remove(id: string, tenant: { organizationId: string }): Promise<void> {
    const app = await this.getById(id, tenant);
    const ctx = await this.kube.forEnvironment(app.environmentId, tenant);
    await this.reconcilers.forApplication().destroy({ app, image: "" }, ctx);
    await withTransaction(() => this.apps.delete(id), { tenant });
  }
}

function safeDecrypt(value: string): string {
  try {
    return decrypt(value);
  } catch {
    return value;
  }
}
