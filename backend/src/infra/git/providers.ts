import crypto from "crypto";
import type { GitRepo, IGitProvider, StackDetection } from "@interface/integrations";

/**
 * Strategies de provedor Git. Cada provedor implementa o mesmo contrato (listar
 * repos/branches, detectar stack, validar webhook) — o fluxo de deploy é idêntico
 * para GitHub PRs, GitLab MRs e Gitea PRs.
 */
abstract class BaseGitProvider implements IGitProvider {
  constructor(
    protected readonly accessToken: string,
    protected readonly webhookSecret: string,
    protected readonly baseUrl: string,
  ) {}

  abstract listRepos(): Promise<GitRepo[]>;
  abstract listBranches(repo: string): Promise<string[]>;
  abstract detectStack(repo: string, branch: string): Promise<StackDetection>;

  protected async api<T>(path: string, headers: Record<string, string>): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, { headers });
    if (!res.ok) throw new Error(`Git API ${res.status}: ${path}`);
    return res.json() as Promise<T>;
  }

  /** HMAC-SHA256 (GitHub/Gitea: header `sha256=...`). */
  verifyWebhook(signature: string | undefined, rawBody: Buffer | string): boolean {
    if (!signature) return false;
    const expected = "sha256=" + crypto.createHmac("sha256", this.webhookSecret).update(rawBody).digest("hex");
    try {
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false;
    }
  }
}

export class GitHubProvider extends BaseGitProvider {
  private headers() {
    return { Authorization: `Bearer ${this.accessToken}`, Accept: "application/vnd.github+json", "User-Agent": "capiva-cloud" };
  }
  async listRepos(): Promise<GitRepo[]> {
    const repos = await this.api<any[]>("/user/repos?per_page=100&sort=updated", this.headers());
    return repos.map((r) => ({ id: String(r.id), name: r.name, fullName: r.full_name, defaultBranch: r.default_branch, private: r.private }));
  }
  async listBranches(repo: string): Promise<string[]> {
    const branches = await this.api<any[]>(`/repos/${repo}/branches?per_page=100`, this.headers());
    return branches.map((b) => b.name);
  }
  async detectStack(repo: string, branch: string): Promise<StackDetection> {
    const tree = await this.api<{ tree: { path: string }[] }>(`/repos/${repo}/git/trees/${branch}?recursive=0`, this.headers());
    return detectFromPaths(tree.tree.map((t) => t.path));
  }
}

export class GitLabProvider extends BaseGitProvider {
  private headers() {
    return { "PRIVATE-TOKEN": this.accessToken };
  }
  async listRepos(): Promise<GitRepo[]> {
    const repos = await this.api<any[]>("/api/v4/projects?membership=true&per_page=100", this.headers());
    return repos.map((r) => ({ id: String(r.id), name: r.name, fullName: r.path_with_namespace, defaultBranch: r.default_branch, private: r.visibility !== "public" }));
  }
  async listBranches(repo: string): Promise<string[]> {
    const branches = await this.api<any[]>(`/api/v4/projects/${encodeURIComponent(repo)}/repository/branches`, this.headers());
    return branches.map((b) => b.name);
  }
  async detectStack(repo: string, branch: string): Promise<StackDetection> {
    const tree = await this.api<any[]>(`/api/v4/projects/${encodeURIComponent(repo)}/repository/tree?ref=${branch}&per_page=100`, this.headers());
    return detectFromPaths(tree.map((t) => t.path));
  }
  /** GitLab usa header `X-Gitlab-Token` (comparação direta do secret). */
  override verifyWebhook(signature: string | undefined): boolean {
    return Boolean(signature && signature === this.webhookSecret);
  }
}

export class GiteaProvider extends BaseGitProvider {
  private headers() {
    return { Authorization: `token ${this.accessToken}` };
  }
  async listRepos(): Promise<GitRepo[]> {
    const repos = await this.api<any[]>("/api/v1/user/repos?limit=100", this.headers());
    return repos.map((r) => ({ id: String(r.id), name: r.name, fullName: r.full_name, defaultBranch: r.default_branch, private: r.private }));
  }
  async listBranches(repo: string): Promise<string[]> {
    const branches = await this.api<any[]>(`/api/v1/repos/${repo}/branches`, this.headers());
    return branches.map((b) => b.name);
  }
  async detectStack(repo: string, branch: string): Promise<StackDetection> {
    const tree = await this.api<{ tree: { path: string }[] }>(`/api/v1/repos/${repo}/git/trees/${branch}?recursive=false`, this.headers());
    return detectFromPaths((tree.tree ?? []).map((t) => t.path));
  }
}

function detectFromPaths(paths: string[]): StackDetection {
  const dockerfiles = paths.filter((p) => /(^|\/)Dockerfile(\.[\w-]+)?$/.test(p));
  const signals = [
    "package.json",
    "pnpm-workspace.yaml",
    "turbo.json",
    "nx.json",
    "docker-compose.yml",
    "docker-compose.yaml",
  ].filter((s) => paths.some((p) => p.endsWith(s)));
  return { dockerfiles: dockerfiles.length ? dockerfiles : ["Dockerfile"], signals };
}

export const DEFAULT_BASE_URL: Record<string, string> = {
  GITHUB: "https://api.github.com",
  GITLAB: "https://gitlab.com",
  GITEA: "https://gitea.com",
};
