import { Injectable } from "@di/index";
import { GitConnectionRepository } from "@repository/GitConnectionRepository";
import { GitProviderFactory } from "@infra/git/GitProviderFactory";
import { withTransaction } from "@database/withTransaction";
import { repoOf } from "@functions/gitRepo";
import type { CommitStatusInput, CommitStatusState, IGitProvider } from "@interface/integrations";
import type { Application } from "@prisma-generated/client";
import { config } from "../config";

/** Fase do deploy que vira status do commit no provedor Git. */
export type DeployPhase = "started" | "succeeded" | "failed" | "errored";

const PHASE_STATUS: Record<DeployPhase, { state: CommitStatusState; description: string }> = {
  started: { state: "pending", description: "Deploy em andamento." },
  succeeded: { state: "success", description: "Deploy concluído." },
  failed: { state: "failure", description: "Deploy falhou." },
  errored: { state: "error", description: "Erro ao executar o deploy." },
};

/** Link do deploy no painel (o painel é servido na mesma origem pública da API). */
export function buildDeploymentUrl(
  publicUrl: string,
  applicationId: string,
  deploymentId: string,
): string {
  return `${publicUrl.replace(/\/+$/, "")}/applications/${applicationId}?deployment=${deploymentId}`;
}

export function buildCommitStatus(phase: DeployPhase, targetUrl: string): CommitStatusInput {
  return { ...PHASE_STATUS[phase], targetUrl, context: "capiva-cloud" };
}

type CommitStatusApp = Pick<Application, "id" | "gitConnectionId" | "sourceConfig">;

/** Commit do deploy: sha COMPLETO (o rótulo curto da versão não serve para a API). */
export interface DeployCommit {
  sha?: string;
  deploymentId: string;
}

/**
 * Reporta o andamento do deploy como status do commit (GitHub statuses, GitLab
 * commit status, Gitea statuses). É best-effort: token sem permissão, provedor
 * fora do ar ou repositório renomeado nunca derrubam o deploy, só ficam no log.
 */
@Injectable()
export class CommitStatusService {
  constructor(
    private readonly connections: GitConnectionRepository,
    private readonly factory: GitProviderFactory,
  ) {}

  async report(
    app: CommitStatusApp,
    commit: DeployCommit,
    phase: DeployPhase,
    tenant: { organizationId: string },
  ): Promise<void> {
    const repo = repoOf(app.sourceConfig);
    if (!commit.sha || !app.gitConnectionId || !repo) return;
    try {
      const provider = await this.resolveProvider(app.gitConnectionId, tenant);
      if (!provider) return;
      const targetUrl = buildDeploymentUrl(config.publicUrl, app.id, commit.deploymentId);
      await provider.setCommitStatus(repo, commit.sha, buildCommitStatus(phase, targetUrl));
    } catch (error) {
      console.error("[commit-status] não foi possível reportar:", (error as Error).message);
    }
  }

  protected async resolveProvider(
    connectionId: string,
    tenant: { organizationId: string },
  ): Promise<IGitProvider | null> {
    const conn = await withTransaction(() => this.connections.findById(connectionId), { tenant });
    if (!conn || conn.organizationId !== tenant.organizationId) return null;
    return this.factory.fromConnection(conn);
  }
}
