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
    // Webhook é público: chega sem organização no contexto. A conexão é
    // resolvida sem escopo e a assinatura HMAC (abaixo) é o que autentica.
    const conn = await withTransaction(() => this.connections.findByIdUnscoped(connectionId));
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
      // Deploy automático ligado por padrão (comportamento anterior); quem
      // prefere promover manualmente desliga em Configurações.
      if (cfg.autoDeploy === false) continue;
      if (!matchesWatchPaths(cfg.watchPaths as unknown, event.changedPaths)) continue;
      await this.deployments.trigger(app.id, event.sha.slice(0, 7), tenant);
      triggered++;
    }
    return { triggered };
  }
}

/**
 * Filtro de caminhos observados (monorepo): sem `watchPaths` configurado, todo
 * push dispara. Com a lista, só dispara quando o push mexeu em algum arquivo
 * sob um dos prefixos — evita reconstruir todos os serviços do repositório a
 * cada commit.
 *
 * Um push sem lista de arquivos no payload (ou com mais de 20 commits, quando
 * os provedores truncam) dispara por segurança: melhor um build a mais do que
 * perder um deploy.
 */
export function matchesWatchPaths(configured: unknown, changedPaths: string[] | undefined): boolean {
  const paths = Array.isArray(configured) ? configured.map(String).map((p) => p.trim()).filter(Boolean) : [];
  if (paths.length === 0) return true;
  if (!changedPaths?.length) return true;

  const normalize = (value: string) => value.replace(/^\.?\//, "").replace(/\/+$/, "");
  const prefixes = paths.map(normalize);
  return changedPaths.some((file) => {
    const target = normalize(file);
    return prefixes.some((prefix) => target === prefix || target.startsWith(`${prefix}/`));
  });
}

/**
 * Arquivos tocados pelo push. GitHub, GitLab e Gitea usam o mesmo formato de
 * commit (`added`/`modified`/`removed`), então uma leitura só cobre os três.
 */
function changedPathsOf(body: any): string[] {
  const commits: any[] = Array.isArray(body?.commits) ? body.commits : [];
  const files = commits.flatMap((c) => [...(c?.added ?? []), ...(c?.modified ?? []), ...(c?.removed ?? [])]);
  return [...new Set(files.filter((f): f is string => typeof f === "string"))];
}

/** Normaliza payloads de push de GitHub/GitLab/Gitea para um formato comum. */
function parsePushEvent(body: any): { branch: string; sha: string; repo?: string; changedPaths: string[] } | null {
  // GitHub/Gitea: { ref: "refs/heads/main", after, repository.full_name }
  if (body.ref?.startsWith("refs/heads/")) {
    return {
      branch: body.ref.replace("refs/heads/", ""),
      sha: body.after ?? body.head_commit?.id ?? "",
      repo: body.repository?.full_name,
      changedPaths: changedPathsOf(body),
    };
  }
  // GitLab: { ref: "refs/heads/main", checkout_sha, project.path_with_namespace }
  if (body.object_kind === "push" && body.ref) {
    return {
      branch: body.ref.replace("refs/heads/", ""),
      sha: body.checkout_sha ?? body.after ?? "",
      repo: body.project?.path_with_namespace,
      changedPaths: changedPathsOf(body),
    };
  }
  return null;
}
