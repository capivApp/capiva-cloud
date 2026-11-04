import { Injectable } from "@di/index";
import { ApplicationService } from "@service/ApplicationService";
import { EnvVarService } from "@service/EnvVarService";
import { DomainService } from "@service/DomainService";
import { ScalingService } from "@service/ScalingService";
import { GitConnectionService } from "@service/GitConnectionService";
import { GitProviderFactory } from "@infra/git/GitProviderFactory";
import { CapivaConfigError, parseCapivaConfig } from "@schemas/capivaConfig.schema";
import { planCapivaConfig, type CapivaAction, type CapivaSnapshot } from "@service/capivaConfig.strategy";
import { withoutReconcile } from "@functions/reconcileScope";
import { repoOf } from "@functions/gitRepo";
import type { IGitProvider } from "@interface/integrations";
import type { Application } from "@prisma-generated/client";

type Tenant = { organizationId: string };

/** Registra uma linha na timeline do deploy. */
export type DeployEventSink = (label: string) => Promise<unknown>;

export const CAPIVA_FILE = "capiva.json";

/** Onde procurar: diretório da aplicação (monorepo) primeiro, depois a raiz. */
export const candidatePaths = (subPath: unknown): string[] => {
  const dir = typeof subPath === "string" ? subPath.replace(/^\.?\/+|\/+$/g, "") : "";
  return [...new Set([dir && `${dir}/${CAPIVA_FILE}`, CAPIVA_FILE].filter(Boolean))];
};

/**
 * Infra como código: lê o `capiva.json` no commit do deploy e o aplica pelos MESMOS
 * services que a tela usa (PATCH, variáveis, domínios, autoscaling, volumes). Nada
 * de caminho paralelo: as regras de cada service continuam valendo. O reconcile de
 * cada um fica ADIADO: o do próprio deploy, depois do build, aplica tudo com a imagem nova.
 *
 * Arquivo inválido falha ANTES de qualquer escrita: o deploy para e o que está no
 * ar não é tocado.
 */
@Injectable()
export class CapivaConfigService {
  constructor(
    private readonly apps: ApplicationService,
    private readonly envVars: EnvVarService,
    private readonly domains: DomainService,
    private readonly scaling: ScalingService,
    private readonly gitConnections: GitConnectionService,
    private readonly gitProviders: GitProviderFactory,
  ) {}

  /** Executor por tipo de ação (strategy map): cada um chama o service da tela. */
  private readonly executors: { [K in CapivaAction["kind"]]: (appId: string, action: Extract<CapivaAction, { kind: K }>, tenant: Tenant) => Promise<unknown> } = {
    patch: (appId, a, tenant) => this.apps.patch(appId, a.dto, tenant),
    buildArgs: (appId, a, tenant) => this.apps.replaceBuildArgs(appId, a.buildArgs, tenant),
    env: (appId, a, tenant) => this.envVars.replace(appId, a.vars, tenant),
    scaling: (appId, a, tenant) => this.scaling.setPolicy(appId, a.policy, tenant),
    addDomain: (appId, a, tenant) => this.domains.add(appId, { host: a.host }, tenant),
    removeDomain: (appId, a, tenant) => this.domains.remove(appId, a.domainId, tenant),
    addVolume: (appId, a, tenant) => this.apps.addVolume(appId, a.volume, tenant),
  };

  /**
   * Aplica o arquivo antes do build. Devolve a aplicação relida (com o que o
   * arquivo mudou). Sem Git ou sem arquivo, devolve a aplicação como veio. Vale para
   * toda origem vinda de um repositório (GitHub, Nixpacks, Railpack, Compose...).
   */
  async applyForDeploy(app: Application, commitId: string | undefined, tenant: Tenant, onEvent: DeployEventSink): Promise<Application> {
    const repo = repoOf(app.sourceConfig);
    if (!app.gitConnectionId || !repo) return app;

    const cfg = (app.sourceConfig ?? {}) as Record<string, unknown>;
    const ref = commitId || (cfg.branch as string | undefined) || "main";
    const found = await this.reportFailure(() => this.readCapivaFile(app.gitConnectionId!, repo, cfg.subPath, ref, tenant), onEvent);
    if (!found) {
      await this.clearMarker(app, cfg, tenant);
      return app;
    }

    const plan = await this.reportFailure(async () => planCapivaConfig(parseCapivaConfig(found.content), await this.snapshotOf(app, tenant)), onEvent);
    await this.reportFailure(() => withoutReconcile(() => this.executeAll(app.id, plan.actions, tenant)), onEvent);
    await this.apps.saveCapivaMarker(app.id, { path: found.path, ref, fields: plan.fields, envKeys: plan.envKeys }, tenant);
    await onEvent(`capiva.json aplicado (${found.path})`);
    return this.apps.getById(app.id, tenant);
  }

  private async executeAll(appId: string, actions: CapivaAction[], tenant: Tenant): Promise<void> {
    for (const action of actions) await this.execute(appId, action, tenant);
  }

  /**
   * Recusa do service (domínio em uso, quota, autoscaling fora do ROLLING) é erro do
   * arquivo: vai para a timeline e não dispara rollback, porque nada foi ao ar ainda.
   */
  private async execute(appId: string, action: CapivaAction, tenant: Tenant): Promise<unknown> {
    const executor = this.executors[action.kind] as (id: string, a: CapivaAction, t: Tenant) => Promise<unknown>;
    try {
      return await executor(appId, action, tenant);
    } catch (error) {
      throw new CapivaConfigError(`capiva.json não aplicado: ${(error as Error).message}`);
    }
  }

  /** Falha do arquivo vai para a timeline antes de parar o deploy. */
  private async reportFailure<T>(fn: () => Promise<T>, onEvent: DeployEventSink): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof CapivaConfigError) await onEvent(error.message);
      throw error;
    }
  }

  private async snapshotOf(app: Application, tenant: Tenant): Promise<CapivaSnapshot> {
    const [env, domains, volumes, scaling] = await Promise.all([
      this.envVars.list(app.id, tenant),
      this.domains.list(app.id, tenant),
      this.apps.listVolumes(app.id, tenant),
      this.scaling.getPolicy(app.id, tenant),
    ]);
    return { app, env, domains, volumes, scaling };
  }

  private async readCapivaFile(connectionId: string, repo: string, subPath: unknown, ref: string, tenant: Tenant) {
    const provider = await this.providerFor(connectionId, tenant);
    for (const path of candidatePaths(subPath)) {
      const content = await this.readOrFail(provider, repo, ref, path);
      if (content !== null) return { path, content };
    }
    return null;
  }

  private async readOrFail(provider: IGitProvider, repo: string, ref: string, path: string): Promise<string | null> {
    try {
      return await provider.readFile(repo, ref, path);
    } catch (error) {
      console.error("[capiva.json] leitura falhou:", (error as Error).message);
      throw new CapivaConfigError("Não foi possível ler o capiva.json do repositório. Tente o deploy de novo.");
    }
  }

  private async providerFor(connectionId: string, tenant: Tenant): Promise<IGitProvider> {
    const [conn, { token }] = await Promise.all([
      this.gitConnections.getById(tenant.organizationId, connectionId),
      this.gitConnections.credentials(tenant.organizationId, connectionId),
    ]);
    return this.gitProviders.build({ provider: conn.provider, accessToken: token, webhookSecret: conn.webhookSecret, baseUrl: conn.baseUrl });
  }

  /** Arquivo removido do repositório: a tela volta a editar tudo. */
  private async clearMarker(app: Application, cfg: Record<string, unknown>, tenant: Tenant): Promise<void> {
    if (!cfg.capivaJson) return;
    await this.apps.saveCapivaMarker(app.id, null, tenant);
  }
}
