import { Injectable } from "@di/index";
import { ApplicationRepository } from "@repository/ApplicationRepository";
import { EnvVarRepository } from "@repository/EnvVarRepository";
import { ApplicationService } from "@service/ApplicationService";
import { DeploymentService } from "@service/DeploymentService";
import { PreviewNotifier } from "@service/preview/PreviewNotifier";
import { createPreviewActionStrategy, type PreviewOperations } from "@service/preview/previewAction.strategy";
import { buildPreviewInput, buildPreviewMeta } from "@service/preview/previewInput";
import { buildPreviewHost, buildPreviewUrl } from "@service/preview/previewNaming";
import { isPreviewExpirado } from "@service/preview/previewEligibility";
import { readPreviewSettings } from "@service/preview/previewSettings";
import type { PullRequestEvent } from "@infra/realtime/GitEventBus";
import { withTransaction } from "@database/withTransaction";
import { HttpError } from "@functions/HttpError";
import type { Application, Prisma } from "@prisma-generated/client";

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
    await this.appService.remove(previewId, tenant);
  }

  /** Limpeza por TTL: destrói previews sem atividade há mais de `CAPIVA_PREVIEW_TTL_DAYS`. */
  async destroyExpired(now: Date = new Date()): Promise<number> {
    const { ttlDays } = readPreviewSettings();
    const previews = await withTransaction(() => this.apps.listAllPreviewsWithOrg(), {}).catch(() => []);
    const expirados = previews.filter((preview) => isPreviewExpirado(preview, now, ttlDays));

    for (const preview of expirados) {
      await this.appService.remove(preview.id, { organizationId: preview.project.organizationId }).catch(logError(`ttl ${preview.name}`));
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
        await this.deployments.trigger(preview.id, version, tenant);
      },
      destroyPreview: (preview) => this.appService.remove(preview.id, tenant),
      notify: (event, previewUrl) => this.notifier.notify(event, previewUrl).catch(logError("aviso no PR")),
      previewUrlOf: (preview) => buildPreviewUrl(buildPreviewHost(preview.name, readPreviewSettings().domain)),
    };
  }

  private async createPreview(origem: Application, event: PullRequestEvent, tenant: Tenant): Promise<Application> {
    const preview = await this.appService.create(buildPreviewInput(origem, event, readPreviewSettings()), tenant);
    await this.copyEnvVars(origem.id, preview.id, tenant);
    return preview;
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
        await this.envVars.upsert({ applicationId: previewId, key: v.key, value: v.value, secret: v.secret, source: v.source });
      }
    }, { tenant });
  }

  private refreshPreview(preview: Application, event: PullRequestEvent, tenant: Tenant): Promise<Application> {
    const cfg = { ...((preview.sourceConfig as Record<string, unknown>) ?? {}), branch: event.sourceBranch, preview: buildPreviewMeta(event) };
    return withTransaction(() => this.apps.update(preview.id, { sourceConfig: cfg as Prisma.InputJsonValue }), { tenant });
  }
}
