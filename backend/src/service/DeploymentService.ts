import { Injectable } from "@di/index";
import { DeploymentRepository } from "@repository/DeploymentRepository";
import { ApplicationRepository } from "@repository/ApplicationRepository";
import { ApplicationService } from "@service/ApplicationService";
import { EnvVarRepository } from "@repository/EnvVarRepository";
import { ReconcilerFactory } from "@infra/kubernetes/ReconcilerFactory";
import { KubernetesAdapter } from "@infra/kubernetes/KubernetesAdapter";
import { BuildStrategyResolver } from "@infra/build/strategies";
import { NotificationService } from "@service/NotificationService";
import { GitConnectionService } from "@service/GitConnectionService";
import { DockerRegistryService } from "@service/DockerRegistryService";
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
    private readonly appService: ApplicationService,
    private readonly notifications: NotificationService,
    private readonly gitConnections: GitConnectionService,
    private readonly registries: DockerRegistryService,
  ) {}

  listByApplication(applicationId: string, tenant: { organizationId: string }): Promise<Deployment[]> {
    return withTransaction(() => this.deployments.listByApplication(applicationId), { tenant });
  }

  getById(id: string, tenant: { organizationId: string }): Promise<Deployment | null> {
    return withTransaction(() => this.deployments.findById(id), { tenant });
  }

  /** Logs crus do Job de build (Kaniko) de um deploy, pelo label do deployment. */
  async buildLogs(deploymentId: string, tenant: { organizationId: string }): Promise<string> {
    const deployment = await withTransaction(() => this.deployments.findById(deploymentId), { tenant });
    if (!deployment) throw HttpError.notFound("Deploy não encontrado.");
    const app = await withTransaction(() => this.apps.findById(deployment.applicationId), { tenant });
    if (!app) throw HttpError.notFound("Aplicação não encontrada.");
    const ctx = await this.kube.forEnvironment(app.environmentId, tenant);
    return this.k8s.podLogsByLabel(ctx, `capiva.cloud/deployment=${deploymentId}`);
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

  /** Credenciais Git p/ Kaniko. `oauth2:<token>` via HTTPS basic auth vale em GitHub/GitLab/Gitea. */
  private async resolveGitAuth(
    gitConnectionId: string,
    tenant: { organizationId: string },
  ): Promise<{ username: string; password: string } | undefined> {
    try {
      const { token } = await this.gitConnections.credentials(tenant.organizationId, gitConnectionId);
      return { username: "oauth2", password: token };
    } catch (error) {
      console.error("[deploy] credenciais Git indisponíveis:", (error as Error).message);
      return undefined;
    }
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
    // Destino do push: registry padrão da org (host real) ou fallback hospedado.
    const pushTarget = await this.registries.defaultPushTarget(tenant.organizationId);
    const registryHost = pushTarget?.host ?? "registry.capiva.cloud";
    const target = `${registryHost}/${app.name}:${version}`;
    // Conexão Git → credenciais para clonar repositório privado no build (Kaniko).
    const gitAuth = app.gitConnectionId ? await this.resolveGitAuth(app.gitConnectionId, tenant) : undefined;
    // O resultado do build define a imagem a deployar: para DOCKER_IMAGE é a
    // própria imagem informada; para origens por código é a imagem publicada.
    const push = pushTarget ? { insecure: pushTarget.insecure, credentials: pushTarget.credentials } : undefined;
    const built = await this.builds.resolve(app.source).build({ source: app.source, config: app.sourceConfig as any, imageRef: target, ctx, app: app.name, deploymentId, gitAuth, push });
    // Origens por código geram um Job de build (Kaniko) — aplica para rodar e expor logs.
    if (built.manifest) await this.k8s.apply(ctx, built.manifest).catch((e) => console.error("[build] apply:", (e as Error).message));
    const imageRef = built.imageRef;

    await step("Imagem publicada", "PUSHING", 40);
    await step("Deploy iniciado", "DEPLOYING", 60);

    // Reconcilia via ApplicationService (carrega envs, volumes, deps, domínio, TLS).
    const status = await this.appService.reconcile(app, tenant, undefined, imageRef);

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

    if (status.ready) {
      void this.notifications.dispatch(tenant.organizationId, {
        event: "deploy.succeeded",
        title: `Deploy concluído: ${app.name}`,
        body: `Versão ${version} publicada com sucesso (${status.replicas ?? 0} réplicas).`,
      });
    }
  }

  private async fail(deploymentId: string, tenant: { organizationId: string }): Promise<void> {
    await withTransaction(async () => {
      await this.deployments.addEvent({ deploymentId, label: "Deploy falhou" });
      await this.deployments.update(deploymentId, { status: "FAILED", finishedAt: new Date() });
      deploymentEvents.emit(deploymentId, { label: "Deploy falhou", status: "FAILED", progress: 100, done: true });
    }, { tenant });

    void this.notifications.dispatch(tenant.organizationId, {
      event: "deploy.failed",
      title: "Deploy falhou",
      body: `Um deploy falhou e será avaliado para rollback automático.`,
    });

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

    const status = await this.appService.reconcile(app, tenant, undefined, target.imageRef!);

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
