import { Injectable } from "@di/index";
import { ApplicationRepository } from "@repository/ApplicationRepository";
import { EnvVarRepository } from "@repository/EnvVarRepository";
import { ServiceDependencyRepository } from "@repository/ServiceDependencyRepository";
import { ApplicationService } from "@service/ApplicationService";
import { DeploymentService } from "@service/DeploymentService";
import { NetworkPolicyService } from "@service/NetworkPolicyService";
import { PreviewNotifier } from "@service/preview/PreviewNotifier";
import { createPreviewActionStrategy, type PreviewOperations } from "@service/preview/previewAction.strategy";
import { buildPreviewInput, buildPreviewMeta } from "@service/preview/previewInput";
import { buildPreviewHost, buildPreviewUrl } from "@service/preview/previewNaming";
import { isPreviewExpirado } from "@service/preview/previewEligibility";
import { readPreviewSettings } from "@service/preview/previewSettings";
import type { PullRequestEvent } from "@infra/realtime/GitEventBus";
import { withTransaction } from "@database/withTransaction";
import { HttpError } from "@functions/HttpError";
import type { Application } from "@prisma-generated/client";

type Tenant = { organizationId: string };

const logError = (scope: string) => (error: unknown) => console.error(`[preview] ${scope}:`, (error as Error).message);

/**
 * Preview deployments por PR/MR. Reage aos eventos do `gitEvents` (ver
 * bootstrap/previewDeployments.ts): a strategy da ação decide QUEM reage e O
 * QUE fazer; este service só implementa as operações (banco, cluster, aviso).
 *
 * O preview é uma Application comum com `previewOfId` + `previewPrNumber`, no
 * mesmo projeto e ambiente da origem: reaproveita build, reconcile, domínio e
 * TLS sem caminho paralelo.
 */
@Injectable()
export class PreviewDeploymentService {
  constructor(
    private readonly apps: ApplicationRepository,
    private readonly envVars: EnvVarRepository,
    private readonly deps: ServiceDependencyRepository,
    private readonly networkPolicies: NetworkPolicyService,
    private readonly appService: ApplicationService,
    private readonly deployments: DeploymentService,
    private readonly notifier: PreviewNotifier,
  ) {}

  /** Processa um evento de PR. Retorna quantas aplicações de origem reagiram. */
  async handlePullRequest(event: PullRequestEvent): Promise<number> {
    const strategy = createPreviewActionStrategy(event.action);
    if (!strategy) return 0;

    const tenant = { organizationId: event.organizationId };
    const candidatas = await withTransaction(() => this.apps.listByGitConnection(event.connectionId), { tenant });
    const origens = candidatas.filter((origem) => strategy.isOrigemElegivel(origem, event));
    const ops = this.buildOperations(tenant);

    for (const origem of origens) await strategy.apply(origem, event, ops).catch(logError(`${event.action} #${event.number} ${origem.name}`));
    return origens.length;
  }

  /** Destrói um preview pela tela da aplicação de origem. */
  async destroyPreview(applicationId: string, previewId: string, tenant: Tenant): Promise<void> {
    const preview = await this.appService.getById(previewId, tenant);
    if (preview.previewOfId !== applicationId) throw HttpError.notFound("Preview não encontrado.");
    await this.removePreview(previewId, tenant);
  }

  /** Limpeza por TTL: destrói previews sem atividade há mais de `CAPIVA_PREVIEW_TTL_DAYS`. */
  async destroyExpired(now: Date = new Date()): Promise<number> {
    const { ttlDays } = readPreviewSettings();
    const previews = await withTransaction(() => this.apps.listAllPreviewsWithOrg(), {}).catch(() => []);
    const expirados = previews.filter((preview) => isPreviewExpirado(preview, now, ttlDays));

    for (const preview of expirados) {
      await this.removePreview(preview.id, { organizationId: preview.project.organizationId }).catch(logError(`ttl ${preview.name}`));
    }
    return expirados.length;
  }

  private buildOperations(tenant: Tenant): PreviewOperations {
    return {
      findPreview: (origem, event) => withTransaction(() => this.apps.findPreview(origem.id, event.number), { tenant }),
      createPreview: (origem, event) => this.createPreview(origem, event, tenant),
      refreshPreview: (preview, event) => this.refreshPreview(preview, event, tenant),
      deployPreview: async (preview, event) => {
        // A versão vira a tag da imagem: sem sha no evento, uma tag única do PR.
        const version = event.headSha.slice(0, 7) || `pr-${event.number}-${Date.now()}`;
        // A origem do commit é o que faz o deploy reportar o status no PR.
        await this.deployments.trigger(preview.id, version, tenant, undefined, { commitSha: event.headSha || undefined });
      },
      destroyPreview: (preview) => this.removePreview(preview.id, tenant),
      notify: (event, previewUrl) => this.notifier.notify(event, previewUrl).catch(logError("aviso no PR")),
      notifyFailure: (event, message) => this.notifier.notifyFailure(event, message).catch(logError("aviso no PR")),
      previewUrlOf: (preview) => buildPreviewUrl(buildPreviewHost(preview.name, readPreviewSettings().domain)),
    };
  }

  private async createPreview(origem: Application, event: PullRequestEvent, tenant: Tenant): Promise<Application> {
    const preview = await this.appService.create(buildPreviewInput(origem, event, readPreviewSettings()), tenant);
    await this.copyEnvVars(origem.id, preview.id, tenant);
    await this.copyDependencies(origem.id, preview.id, tenant);
    return preview;
  }

  /**
   * As variáveis INJECTED já vieram com as env vars; falta a aresta. Sem ela,
   * com isolamento de rede, a NetworkPolicy do destino em outro ambiente só
   * libera o nome da origem e o preview não conecta.
   */
  private async copyDependencies(origemId: string, previewId: string, tenant: Tenant): Promise<void> {
    const ambientes = await withTransaction(async () => {
      const deps = await this.deps.listBySource(origemId);
      for (const dep of deps) {
        await this.deps.create({
          sourceId: previewId,
          targetId: dep.targetId,
          injectedKeys: dep.injectedKeys ?? undefined,
        });
      }
      return this.deps.listTargetEnvironmentIds(previewId);
    }, { tenant });
    await this.syncNetworkPolicies(ambientes, tenant);
  }

  /**
   * O cascade do banco apaga as arestas do preview, mas a NetworkPolicy dos
   * ambientes de destino continuaria liberando o nome dele até o próximo sync.
   */
  private async removePreview(previewId: string, tenant: Tenant): Promise<void> {
    const ambientes = await withTransaction(() => this.deps.listTargetEnvironmentIds(previewId), { tenant });
    await this.appService.remove(previewId, tenant);
    await this.syncNetworkPolicies(ambientes, tenant);
  }

  private async syncNetworkPolicies(environmentIds: string[], tenant: Tenant): Promise<void> {
    for (const environmentId of environmentIds) await this.networkPolicies.syncEnvironmentQuietly(environmentId, tenant);
  }

  /**
   * Copia as variáveis como estão gravadas: segredo continua cifrado e com a
   * flag `secret`. Passar pelo `env` do create gravaria o texto cifrado como
   * valor aberto.
   */
  private copyEnvVars(origemId: string, previewId: string, tenant: Tenant): Promise<void> {
    return withTransaction(async () => {
      const vars = await this.envVars.listByApplication(origemId);
      for (const v of vars) {
        await this.envVars.upsert({
          applicationId: previewId,
          key: v.key,
          value: v.value,
          secret: v.secret,
          source: v.source,
          // Sem o cofre, a variável EXTERNAL sai do container (containerEnv) e o preview sobe sem o segredo.
          secretStoreId: v.secretStoreId,
          remoteProperty: v.remoteProperty,
        });
      }
    }, { tenant });
  }

  private refreshPreview(preview: Application, event: PullRequestEvent, tenant: Tenant): Promise<Application> {
    const cfg = { ...((preview.sourceConfig as Record<string, unknown>) ?? {}), branch: event.sourceBranch, preview: buildPreviewMeta(event) };
    return withTransaction(() => this.apps.update(preview.id, { sourceConfig: cfg }), { tenant });
  }
}
