import { Injectable } from "@di/index";
import { GitConnectionRepository } from "@repository/GitConnectionRepository";
import { ApplicationRepository } from "@repository/ApplicationRepository";
import { GitProviderFactory } from "@infra/git/GitProviderFactory";
import { DeploymentService } from "@service/DeploymentService";
import { withTransaction } from "@database/withTransaction";
import { decrypt } from "@functions/crypto";
import { HttpError } from "@functions/HttpError";
import type { IGitProvider, GitRepo, StackDetection } from "@interface/integrations";

/**
 * Regras de integração Git: lista repos/branches, detecta stack e processa
 * webhooks. Em push para a branch configurada de uma aplicação, dispara o
 * deploy automático (igual para GitHub PRs, GitLab MRs e Gitea PRs).
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
    return this.factory.build({
      provider: conn.provider,
      accessToken: decrypt(conn.accessTokenCipher),
      webhookSecret: conn.webhookSecret,
      baseUrl: conn.baseUrl,
    });
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

  /**
   * Processa um webhook: valida assinatura, identifica branch/repo do push e
   * dispara deploy nas aplicações vinculadas cuja branch de deploy corresponde.
   */
  async handleWebhook(connectionId: string, signature: string | undefined, rawBody: Buffer): Promise<{ triggered: number }> {
    const conn = await withTransaction(() => this.connections.findById(connectionId));
    if (!conn) throw HttpError.notFound("Conexão Git não encontrada.");

    const provider = this.factory.build({
      provider: conn.provider,
      accessToken: decrypt(conn.accessTokenCipher),
      webhookSecret: conn.webhookSecret,
      baseUrl: conn.baseUrl,
    });
    if (!provider.verifyWebhook(signature, rawBody)) throw HttpError.unauthorized("Assinatura de webhook inválida.");

    const event = parsePushEvent(JSON.parse(rawBody.toString("utf8")));
    if (!event) return { triggered: 0 };

    const tenant = { organizationId: conn.organizationId };
    const apps = await withTransaction(() => this.apps.listByGitConnection(connectionId), { tenant });

    let triggered = 0;
    for (const app of apps) {
      const cfg = (app.sourceConfig ?? {}) as Record<string, unknown>;
      const branch = (cfg.branch as string) ?? "main";
      const repo = (cfg.repo as string) ?? (cfg.fullName as string);
      if (branch !== event.branch) continue;
      if (repo && event.repo && repo !== event.repo) continue;
      await this.deployments.trigger(app.id, event.sha.slice(0, 7), tenant);
      triggered++;
    }
    return { triggered };
  }
}

/** Normaliza payloads de push de GitHub/GitLab/Gitea para um formato comum. */
function parsePushEvent(body: any): { branch: string; sha: string; repo?: string } | null {
  // GitHub/Gitea: { ref: "refs/heads/main", after, repository.full_name }
  if (body.ref?.startsWith("refs/heads/")) {
    return {
      branch: body.ref.replace("refs/heads/", ""),
      sha: body.after ?? body.head_commit?.id ?? "",
      repo: body.repository?.full_name,
    };
  }
  // GitLab: { ref: "refs/heads/main", checkout_sha, project.path_with_namespace }
  if (body.object_kind === "push" && body.ref) {
    return {
      branch: body.ref.replace("refs/heads/", ""),
      sha: body.checkout_sha ?? body.after ?? "",
      repo: body.project?.path_with_namespace,
    };
  }
  return null;
}
