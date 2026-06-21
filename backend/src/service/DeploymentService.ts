import { Injectable } from "@di/index";
import { DeploymentRepository } from "@repository/DeploymentRepository";
import { ApplicationRepository } from "@repository/ApplicationRepository";
import { EnvVarRepository } from "@repository/EnvVarRepository";
import { ReconcilerFactory } from "@infra/kubernetes/ReconcilerFactory";
import { KubernetesAdapter } from "@infra/kubernetes/KubernetesAdapter";
import { BuildStrategyResolver } from "@infra/build/strategies";
import { KubeContextResolver } from "@service/KubeContextResolver";
import { deploymentEvents } from "@infra/realtime/EventBus";
import { withTransaction } from "@database/withTransaction";
import { decrypt } from "@functions/crypto";
import { HttpError } from "@functions/HttpError";
import type { Application, Deployment } from "@prisma-generated/client";

/**
 * Orquestra o ciclo de deploy: build → push → deploy → health, registrando a
 * timeline (DeploymentEvent) e emitindo eventos em tempo real (SSE). Zero-downtime
 * e rollback ficam a cargo do reconciler (Argo Rollouts) quando a estratégia ≠ ROLLING.
 */
@Injectable()
export class DeploymentService {
  constructor(
    private readonly deployments: DeploymentRepository,
    private readonly apps: ApplicationRepository,
    private readonly envVars: EnvVarRepository,
    private readonly reconcilers: ReconcilerFactory,
    private readonly builds: BuildStrategyResolver,
    private readonly kube: KubeContextResolver,
    private readonly k8s: KubernetesAdapter,
  ) {}

  listByApplication(applicationId: string, tenant: { organizationId: string }): Promise<Deployment[]> {
    return withTransaction(() => this.deployments.listByApplication(applicationId), { tenant });
  }

  getById(id: string, tenant: { organizationId: string }): Promise<Deployment | null> {
    return withTransaction(() => this.deployments.findById(id), { tenant });
  }

  /** Dispara um novo deploy (manual ou por webhook Git). Retorna imediatamente. */
  async trigger(
    applicationId: string,
    version: string,
    tenant: { organizationId: string },
    commitId?: string,
  ): Promise<Deployment> {
    const app = await withTransaction(() => this.apps.findById(applicationId), { tenant });
    if (!app) throw HttpError.notFound("Aplicação não encontrada.");

    const deployment = await withTransaction(
      () =>
        this.deployments.create({
          applicationId,
          version,
          commitId,
          strategy: app.rolloutStrategy,
          status: "QUEUED",
        }),
      { tenant },
    );

    this.run(deployment.id, app, version, tenant).catch(async (error) => {
      await this.fail(deployment.id, tenant);
      console.error("[deploy] falhou", error);
    });

    return deployment;
  }

  private async run(deploymentId: string, app: Application, version: string, tenant: { organizationId: string }): Promise<void> {
    const ctx = await this.kube.forEnvironment(app.environmentId, tenant);

    const step = (label: string, status: Deployment["status"], progress: number) =>
      withTransaction(async () => {
        await this.deployments.addEvent({ deploymentId, label });
        await this.deployments.update(deploymentId, { status, progress });
        deploymentEvents.emit(deploymentId, { label, status, progress });
      }, { tenant });

    await step("Build iniciado", "BUILDING", 10);
    const imageRef = `registry.capiva.cloud/${app.name}:${version}`;
    await this.builds.resolve(app.source).build({ source: app.source, config: app.sourceConfig as any, imageRef, ctx });

    await step("Imagem publicada", "PUSHING", 40);
    await step("Deploy iniciado", "DEPLOYING", 60);

    const envVars = await withTransaction(() => this.envVars.listByApplication(app.id), { tenant });
    const resolvedEnv = envVars.map((e) => ({ key: e.key, value: e.secret ? safeDecrypt(e.value) : e.value }));

    const status = await this.reconcilers.forApplication().reconcile(
      { app: { ...app, sourceConfig: { ...(app.sourceConfig as any), image: imageRef } }, image: imageRef, envVars: resolvedEnv },
      ctx,
    );

    await withTransaction(async () => {
      const label = status.ready ? "Health Check OK" : "Health Check pendente";
      await this.deployments.addEvent({ deploymentId, label });
      await this.deployments.update(deploymentId, {
        status: status.ready ? "HEALTHY" : "DEPLOYING",
        progress: status.ready ? 100 : 80,
        imageRef,
        podCount: status.replicas ?? 0,
        finishedAt: status.ready ? new Date() : null,
      });
      deploymentEvents.emit(deploymentId, { label, status: status.ready ? "HEALTHY" : "DEPLOYING", progress: status.ready ? 100 : 80, done: status.ready });
    }, { tenant });
  }

  private async fail(deploymentId: string, tenant: { organizationId: string }): Promise<void> {
    await withTransaction(async () => {
      await this.deployments.addEvent({ deploymentId, label: "Deploy falhou" });
      await this.deployments.update(deploymentId, { status: "FAILED", finishedAt: new Date() });
      deploymentEvents.emit(deploymentId, { label: "Deploy falhou", status: "FAILED", progress: 100, done: true });
    }, { tenant });

    // Smart rollback: se a app tem rollback automático e existe um deploy saudável
    // anterior, restaura automaticamente a versão estável.
    const failed = await withTransaction(() => this.deployments.findById(deploymentId), { tenant });
    if (!failed) return;
    const app = await withTransaction(() => this.apps.findById(failed.applicationId), { tenant });
    const autoRollback = (app?.rolloutConfig as Record<string, unknown> | null)?.autoRollback !== false;
    if (!app || !autoRollback) return;

    const previous = await withTransaction(() => this.deployments.lastHealthy(app.id, deploymentId), { tenant });
    if (previous?.imageRef) {
      await this.rollbackTo(app.id, previous.id, tenant, true);
    }
  }

  /** Restaura uma versão anterior (rollback manual ou automático) sem rebuild. */
  async rollbackTo(
    applicationId: string,
    deploymentId: string,
    tenant: { organizationId: string },
    automatic = false,
  ): Promise<Deployment> {
    const target = await withTransaction(() => this.deployments.findById(deploymentId), { tenant });
    if (!target?.imageRef) throw HttpError.badRequest("Deploy alvo não possui imagem para restaurar.");
    const app = await withTransaction(() => this.apps.findById(applicationId), { tenant });
    if (!app) throw HttpError.notFound("Aplicação não encontrada.");

    const rollback = await withTransaction(
      () =>
        this.deployments.create({
          applicationId,
          version: `rollback-${target.version}`,
          imageRef: target.imageRef,
          strategy: app.rolloutStrategy,
          status: "DEPLOYING",
          progress: 60,
        }),
      { tenant },
    );

    const ctx = await this.kube.forEnvironment(app.environmentId, tenant);
    const envVars = await withTransaction(() => this.envVars.listByApplication(app.id), { tenant });
    const resolvedEnv = envVars.map((e) => ({ key: e.key, value: e.secret ? safeDecrypt(e.value) : e.value }));
    const status = await this.reconcilers.forApplication().reconcile(
      { app: { ...app, sourceConfig: { ...(app.sourceConfig as any), image: target.imageRef } }, image: target.imageRef!, envVars: resolvedEnv },
      ctx,
    );

    await withTransaction(async () => {
      const label = automatic ? "Rollback automático concluído" : "Rollback concluído";
      await this.deployments.addEvent({ deploymentId: rollback.id, label });
      await this.deployments.update(rollback.id, {
        status: "HEALTHY",
        progress: 100,
        podCount: status.replicas ?? 0,
        finishedAt: new Date(),
      });
      deploymentEvents.emit(rollback.id, { label, status: "HEALTHY", progress: 100, done: true });
    }, { tenant });

    return rollback;
  }
}

function safeDecrypt(value: string): string {
  try {
    return decrypt(value);
  } catch {
    return value;
  }
}
