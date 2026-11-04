import { EventEmitter } from "events";

/** Evento de pull request (GitHub/Gitea) ou merge request (GitLab), já normalizado. */
export interface PullRequestEvent {
  connectionId: string;
  organizationId: string;
  provider: "GITHUB" | "GITLAB" | "GITEA";
  action: "opened" | "synchronized" | "reopened" | "closed" | "merged";
  number: number;
  title: string;
  repo: string;
  sourceBranch: string;
  targetBranch: string;
  headSha: string;
  author?: string;
  url?: string;
}

/**
 * Barramento em memória dos eventos Git normalizados. O GitService publica,
 * quem reage (preview deployments) assina. Mesma interface servirá para Redis
 * pub/sub com várias instâncias.
 */
class GitEventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  emitPullRequest(event: PullRequestEvent): void {
    this.emitter.emit("pull_request", event);
  }

  onPullRequest(listener: (event: PullRequestEvent) => void | Promise<void>): () => void {
    this.emitter.on("pull_request", listener);
    return () => this.emitter.off("pull_request", listener);
  }
}

export const gitEvents = new GitEventBus();
