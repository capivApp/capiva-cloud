import crypto from "crypto";
import type { CommitStatusInput, CommitStatusState, GitRepo, IGitProvider, StackDetection } from "@interface/integrations";

/** Comentário de PR/MR como as três APIs devolvem (só o que o upsert usa). */
interface PullRequestComment {
  id: number | string;
  body?: string;
}

/** GitHub e Gitea aceitam os quatro estados como estão. */
const commitStatusBody = (status: CommitStatusInput) => ({
  state: status.state,
  description: status.description,
  target_url: status.targetUrl,
  context: status.context,
});

/** GitLab não tem failure/error: os dois viram `failed`. */
const GITLAB_COMMIT_STATE: Record<CommitStatusState, string> = {
  pending: "pending",
  success: "success",
  failure: "failed",
  error: "failed",
};

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
  abstract setCommitStatus(repo: string, sha: string, status: CommitStatusInput): Promise<void>;
  protected abstract listPullRequestComments(repo: string, number: number): Promise<PullRequestComment[]>;
  protected abstract createPullRequestComment(repo: string, number: number, body: string): Promise<void>;
  protected abstract updatePullRequestComment(repo: string, number: number, commentId: string, body: string): Promise<void>;

  // --- capiva.json: leitura de arquivo no commit ---
  abstract readFile(repo: string, ref: string, path: string): Promise<string | null>;

  /** Conteúdo base64 das contents/files APIs. 404 = arquivo ausente (null). */
  protected async fetchBase64Content(path: string, headers: Record<string, string>): Promise<string | null> {
    const res = await fetch(`${this.baseUrl}${path}`, { headers });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Git API ${res.status}: ${path}`);
    const body = (await res.json()) as { content?: string };
    return Buffer.from(body.content ?? "", "base64").toString("utf8");
  }
  // --- fim capiva.json ---

  protected async api<T>(path: string, headers: Record<string, string>): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, { headers });
    if (!res.ok) throw new Error(`Git API ${res.status}: ${path}`);
    return res.json() as Promise<T>;
  }

  /** Escrita (POST/PUT/PATCH) com corpo JSON. */
  protected async send(method: "POST" | "PUT" | "PATCH", path: string, headers: Record<string, string>, body: unknown): Promise<void> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Git API ${res.status}: ${method} ${path}`);
  }

  /**
   * Upsert do comentário da plataforma: procura o que tem o marcador oculto e
   * atualiza; sem ele, cria. Assim cada push no PR edita o mesmo comentário em
   * vez de empilhar um novo.
   */
  async commentOnPullRequest(repo: string, number: number, body: string, marker: string): Promise<void> {
    const text = body.includes(marker) ? body : `${marker}\n${body}`;
    const comments = await this.listPullRequestComments(repo, number);
    const existing = comments.find((c) => typeof c.body === "string" && c.body.includes(marker));
    if (existing) return this.updatePullRequestComment(repo, number, String(existing.id), text);
    return this.createPullRequestComment(repo, number, text);
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
  // --- capiva.json ---
  readFile(repo: string, ref: string, path: string): Promise<string | null> {
    return this.fetchBase64Content(`/repos/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`, this.headers());
  }
  private headers() {
    return { Authorization: `Bearer ${this.accessToken}`, Accept: "application/vnd.github+json", "User-Agent": "capiva-cloud" };
  }
  async listRepos(): Promise<GitRepo[]> {
    const repos = await this.api<any[]>("/user/repos?per_page=100&sort=updated", this.headers());
    return repos.map((r) => ({ id: String(r.id), name: r.name, fullName: r.full_name, defaultBranch: r.default_branch, private: r.private, cloneUrl: r.clone_url }));
  }
  async listBranches(repo: string): Promise<string[]> {
    const branches = await this.api<any[]>(`/repos/${repo}/branches?per_page=100`, this.headers());
    return branches.map((b) => b.name);
  }
  async detectStack(repo: string, branch: string): Promise<StackDetection> {
    const tree = await this.api<{ tree: { path: string }[] }>(`/repos/${repo}/git/trees/${branch}?recursive=0`, this.headers());
    return detectFromPaths(tree.tree.map((t) => t.path));
  }
  setCommitStatus(repo: string, sha: string, status: CommitStatusInput): Promise<void> {
    return this.send("POST", `/repos/${repo}/statuses/${sha}`, this.headers(), commitStatusBody(status));
  }
  // PR é issue no GitHub: os comentários da conversa ficam na API de issues.
  protected listPullRequestComments(repo: string, number: number): Promise<PullRequestComment[]> {
    return this.api<PullRequestComment[]>(`/repos/${repo}/issues/${number}/comments?per_page=100`, this.headers());
  }
  protected createPullRequestComment(repo: string, number: number, body: string): Promise<void> {
    return this.send("POST", `/repos/${repo}/issues/${number}/comments`, this.headers(), { body });
  }
  protected updatePullRequestComment(repo: string, _number: number, commentId: string, body: string): Promise<void> {
    return this.send("PATCH", `/repos/${repo}/issues/comments/${commentId}`, this.headers(), { body });
  }
}

export class GitLabProvider extends BaseGitProvider {
  // --- capiva.json ---
  readFile(repo: string, ref: string, path: string): Promise<string | null> {
    const file = `/api/v4/projects/${encodeURIComponent(repo)}/repository/files/${encodeURIComponent(path)}?ref=${encodeURIComponent(ref)}`;
    return this.fetchBase64Content(file, this.headers());
  }
  private headers() {
    return { "PRIVATE-TOKEN": this.accessToken };
  }
  async listRepos(): Promise<GitRepo[]> {
    const repos = await this.api<any[]>("/api/v4/projects?membership=true&per_page=100", this.headers());
    return repos.map((r) => ({ id: String(r.id), name: r.name, fullName: r.path_with_namespace, defaultBranch: r.default_branch, private: r.visibility !== "public", cloneUrl: r.http_url_to_repo }));
  }
  async listBranches(repo: string): Promise<string[]> {
    const branches = await this.api<any[]>(`/api/v4/projects/${encodeURIComponent(repo)}/repository/branches`, this.headers());
    return branches.map((b) => b.name);
  }
  async detectStack(repo: string, branch: string): Promise<StackDetection> {
    const tree = await this.api<any[]>(`/api/v4/projects/${encodeURIComponent(repo)}/repository/tree?ref=${branch}&per_page=100`, this.headers());
    return detectFromPaths(tree.map((t) => t.path));
  }
  setCommitStatus(repo: string, sha: string, status: CommitStatusInput): Promise<void> {
    return this.send("POST", `/api/v4/projects/${encodeURIComponent(repo)}/statuses/${sha}`, this.headers(), {
      state: GITLAB_COMMIT_STATE[status.state],
      description: status.description,
      target_url: status.targetUrl,
      name: status.context,
    });
  }
  private notesPath(repo: string, number: number): string {
    return `/api/v4/projects/${encodeURIComponent(repo)}/merge_requests/${number}/notes`;
  }
  protected listPullRequestComments(repo: string, number: number): Promise<PullRequestComment[]> {
    return this.api<PullRequestComment[]>(`${this.notesPath(repo, number)}?per_page=100`, this.headers());
  }
  protected createPullRequestComment(repo: string, number: number, body: string): Promise<void> {
    return this.send("POST", this.notesPath(repo, number), this.headers(), { body });
  }
  protected updatePullRequestComment(repo: string, number: number, commentId: string, body: string): Promise<void> {
    return this.send("PUT", `${this.notesPath(repo, number)}/${commentId}`, this.headers(), { body });
  }
  /** GitLab usa header `X-Gitlab-Token` (comparação direta do secret). */
  override verifyWebhook(signature: string | undefined): boolean {
    return Boolean(signature && signature === this.webhookSecret);
  }
}

export class GiteaProvider extends BaseGitProvider {
  // --- capiva.json ---
  readFile(repo: string, ref: string, path: string): Promise<string | null> {
    return this.fetchBase64Content(`/api/v1/repos/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`, this.headers());
  }
  private headers() {
    return { Authorization: `token ${this.accessToken}` };
  }
  async listRepos(): Promise<GitRepo[]> {
    const repos = await this.api<any[]>("/api/v1/user/repos?limit=100", this.headers());
    return repos.map((r) => ({ id: String(r.id), name: r.name, fullName: r.full_name, defaultBranch: r.default_branch, private: r.private, cloneUrl: r.clone_url }));
  }
  async listBranches(repo: string): Promise<string[]> {
    const branches = await this.api<any[]>(`/api/v1/repos/${repo}/branches`, this.headers());
    return branches.map((b) => b.name);
  }
  async detectStack(repo: string, branch: string): Promise<StackDetection> {
    const tree = await this.api<{ tree: { path: string }[] }>(`/api/v1/repos/${repo}/git/trees/${branch}?recursive=false`, this.headers());
    return detectFromPaths((tree.tree ?? []).map((t) => t.path));
  }
  setCommitStatus(repo: string, sha: string, status: CommitStatusInput): Promise<void> {
    return this.send("POST", `/api/v1/repos/${repo}/statuses/${sha}`, this.headers(), commitStatusBody(status));
  }
  protected listPullRequestComments(repo: string, number: number): Promise<PullRequestComment[]> {
    return this.api<PullRequestComment[]>(`/api/v1/repos/${repo}/issues/${number}/comments`, this.headers());
  }
  protected createPullRequestComment(repo: string, number: number, body: string): Promise<void> {
    return this.send("POST", `/api/v1/repos/${repo}/issues/${number}/comments`, this.headers(), { body });
  }
  protected updatePullRequestComment(repo: string, _number: number, commentId: string, body: string): Promise<void> {
    return this.send("PATCH", `/api/v1/repos/${repo}/issues/comments/${commentId}`, this.headers(), { body });
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
