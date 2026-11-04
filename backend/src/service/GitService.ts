import { Injectable } from "@di/index";
import { GitConnectionRepository } from "@repository/GitConnectionRepository";
import { ApplicationRepository } from "@repository/ApplicationRepository";
import { GitProviderFactory } from "@infra/git/GitProviderFactory";
import { parseGitWebhook, type GitWebhookEvent } from "@infra/git/webhookEvents";
import { gitEvents } from "@infra/realtime/GitEventBus";
import { DeploymentService } from "@service/DeploymentService";
import { resolveDeployTarget } from "@service/git/deployTrigger.strategy";
import { withTransaction } from "@database/withTransaction";
import { HttpError } from "@functions/HttpError";
import type { IGitProvider, GitRepo, StackDetection } from "@interface/integrations";

export { matchesWatchPaths } from "@service/git/deployTrigger.strategy";

/** Marcador oculto do comentário da plataforma no PR/MR (upsert: um comentário só por PR). */
export const PREVIEW_COMMENT_MARKER = "<!-- capiva-preview -->";

/**
 * Regras de integração Git: lista repos/branches, detecta stack e processa
 * webhooks. Push, tag e release disparam o deploy automático das aplicações
 * vinculadas conforme o gatilho de cada uma; PR/MR é publicado no barramento
 * `gitEvents` (preview deployments assina).
 */
@Injectable()
export class GitService {
  constructor(
    private readonly connections: GitConnectionRepository,
    private readonly apps: ApplicationRepository,
    private readonly factory: GitProviderFactory,
    private readonly deployments: DeploymentService,
  ) {}

  private async providerFor(connectionId: string, tenant: { organizationId: string }): Promise<IGitProvider> {
    const conn = await withTransaction(() => this.connections.findById(connectionId), { tenant });
    if (!conn || conn.organizationId !== tenant.organizationId) throw HttpError.notFound("Conexão Git não encontrada.");
    return this.factory.fromConnection(conn);
  }

  listRepos(connectionId: string, tenant: { organizationId: string }): Promise<GitRepo[]> {
    return this.providerFor(connectionId, tenant).then((p) => p.listRepos());
  }

  listBranches(connectionId: string, repo: string, tenant: { organizationId: string }): Promise<string[]> {
    return this.providerFor(connectionId, tenant).then((p) => p.listBranches(repo));
  }

  detectStack(connectionId: string, repo: string, branch: string, tenant: { organizationId: string }): Promise<StackDetection> {
    return this.providerFor(connectionId, tenant).then((p) => p.detectStack(repo, branch));
  }

  /** Cria ou atualiza o comentário da plataforma no PR/MR (upsert pelo marcador oculto). */
  commentOnPullRequest(connectionId: string, repo: string, number: number, body: string, tenant: { organizationId: string }): Promise<void> {
    return this.providerFor(connectionId, tenant).then((p) => p.commentOnPullRequest(repo, number, body, PREVIEW_COMMENT_MARKER));
  }

  /**
   * Processa um webhook: valida a assinatura, normaliza o evento (pelo header de
   * evento do provedor ou pelo corpo) e despacha: PR/MR vai para o barramento;
   * push, tag e release disparam deploy nas aplicações cujo gatilho casa.
   */
  async handleWebhook(
    connectionId: string,
    signature: string | undefined,
    rawBody: Buffer,
    eventName?: string,
  ): Promise<{ triggered: number }> {
    // Webhook é público: chega sem organização no contexto. A conexão é
    // resolvida sem escopo e a assinatura HMAC (abaixo) é o que autentica.
    const conn = await withTransaction(() => this.connections.findByIdUnscoped(connectionId));
    if (!conn) throw HttpError.notFound("Conexão Git não encontrada.");

    const provider = this.factory.fromConnection(conn);
    if (!provider.verifyWebhook(signature, rawBody)) throw HttpError.unauthorized("Assinatura de webhook inválida.");

    const event = parseGitWebhook(conn.provider, eventName, JSON.parse(rawBody.toString("utf8")));
    if (!event) return { triggered: 0 };

    const tenant = { organizationId: conn.organizationId };
    if (event.kind === "pull_request") {
      gitEvents.emitPullRequest({ ...event.pullRequest, connectionId, organizationId: conn.organizationId, provider: conn.provider });
      return { triggered: 0 };
    }
    return { triggered: await this.triggerDeploys(connectionId, event, tenant) };
  }

  /** Deploy em cada aplicação da conexão cujo gatilho (branch/tag/release) aceita o evento. */
  private async triggerDeploys(connectionId: string, event: GitWebhookEvent, tenant: { organizationId: string }): Promise<number> {
    const apps = await withTransaction(() => this.apps.listByGitConnection(connectionId), { tenant });
    let triggered = 0;
    for (const app of apps) {
      const target = resolveDeployTarget((app.sourceConfig ?? {}) as Record<string, unknown>, event);
      if (!target) continue;
      await this.deployments.trigger(app.id, target.version, tenant, undefined, { commitSha: target.commitSha, gitRef: target.gitRef });
      triggered++;
    }
    return triggered;
  }
}
