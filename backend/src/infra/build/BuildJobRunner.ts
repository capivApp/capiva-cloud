import { Injectable } from "@di/index";
import { BuildConfigError } from "@infra/build/BuildConfigError";
import type { BuildJobInput } from "@infra/kubernetes/buildManifests";
import { KubernetesAdapter } from "@infra/kubernetes/KubernetesAdapter";
import { dockerConfigSecretManifest, gitCredentialsSecretManifest } from "@infra/kubernetes/manifests";
import type { BuildRequest, K8sManifest } from "@interface/integrations";

/** O que muda de uma origem para outra: o manifest do Job e onde ler a falha de clone. */
export interface BuildJobPlan {
  manifest(input: BuildJobInput): K8sManifest;
  /** Container cujo log revela falha de clone. Vazio = container principal (Kaniko puro). */
  cloneLogContainer?: string;
}

type GitPullMethod = BuildJobInput["gitPullMethod"];
type AttemptInput = Omit<BuildJobInput, "name" | "gitPullMethod">;

const GIT_CONNECTION_ERROR =
  /connection refused|dial tcp|resolving source context|no such host|x509|tls:|could not read Username|unable to clone|error fetching|unable to access|could not resolve host|failed to connect/i;

/** Aguarda o término de um Job de build (sucesso/falha) com timeout. */
async function waitForJob(k8s: KubernetesAdapter, ctx: BuildRequest["ctx"], name: string, timeoutMs = 600_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await k8s.observe(ctx, "batch/v1", "Job", name);
    // observe() já retorna o `.status` do recurso em `raw` (não aninhar de novo).
    const raw = (status.raw ?? {}) as { succeeded?: number; failed?: number };
    if (raw.succeeded && raw.succeeded > 0) return;
    if (raw.failed && raw.failed > 0) throw new Error(`Build job ${name} falhou.`);
    await new Promise((resolve) => setTimeout(resolve, 4_000));
  }
  throw new Error(`Build job ${name} expirou (timeout).`);
}

const repoUrlOf = (config: Record<string, unknown>) => (config.repoUrl as string | undefined) ?? (config.repo as string | undefined);

function requireRepo(config: Record<string, unknown>): string {
  const repo = repoUrlOf(config);
  if (repo) return repo;
  throw new BuildConfigError("Origem Git sem repositório (repoUrl).");
}

/** Ordem de tentativa do protocolo de clone: o da URL primeiro, depois o outro. */
const gitPullCandidates = (repo: string): GitPullMethod[] => (repo.startsWith("http://") ? ["http", "https"] : ["https", "http"]);

/**
 * Executor comum dos Jobs de build: cria os secrets efêmeros (push e clone), aplica o
 * Job da origem, espera e, se o CLONE falhou por conexão, retenta com o outro protocolo
 * ("tentar dos dois jeitos"). Os secrets saem no fim, com sucesso ou falha.
 */
@Injectable()
export class BuildJobRunner {
  constructor(private readonly k8s: KubernetesAdapter) {}

  async run(req: BuildRequest, plan: BuildJobPlan): Promise<{ imageRef: string }> {
    const repo = requireRepo(req.config);
    const baseId = Date.now().toString(36);
    const secrets = await this.createSecrets(req, baseId);
    const input: AttemptInput = {
      namespace: req.ctx.namespace,
      imageRef: req.imageRef,
      repo: repo.replace(/^https?:\/\//, ""),
      branch: (req.config.branch as string | undefined) ?? "main",
      subPath: req.config.subPath as string | undefined,
      buildArgs: (req.config.buildArgs as { key: string; value: string }[] | undefined) ?? [],
      deploymentId: req.deploymentId,
      push: Boolean(req.push),
      insecure: req.push?.insecure ?? false,
      port: req.port,
      config: req.config,
      ...secrets,
    };
    try {
      await this.attempt(req, plan, input, baseId, gitPullCandidates(repo), 0);
      return { imageRef: req.imageRef };
    } finally {
      await this.removeSecrets(req.ctx, secrets);
    }
  }

  private async attempt(req: BuildRequest, plan: BuildJobPlan, input: AttemptInput, baseId: string, methods: GitPullMethod[], index: number): Promise<void> {
    const name = `build-${baseId}-${index}`;
    await this.k8s.apply(req.ctx, plan.manifest({ ...input, name, gitPullMethod: methods[index] ?? "https" }));
    const failure = await waitForJob(this.k8s, req.ctx, name).then(
      () => undefined,
      (error: unknown) => error as Error,
    );
    if (!failure) return;
    const isLastAttempt = index >= methods.length - 1;
    if (isLastAttempt || !(await this.isGitConnectionError(req.ctx, name, plan.cloneLogContainer))) throw failure;
    return this.attempt(req, plan, input, baseId, methods, index + 1);
  }

  /** Secrets efêmeros (por build): push (registry com auth) e git (repo privado). */
  private async createSecrets(req: BuildRequest, baseId: string): Promise<{ pushSecret?: string; gitCredentialsSecret?: string }> {
    const pushSecret = req.push?.credentials ? `build-${baseId}-push` : undefined;
    const gitCredentialsSecret = req.gitAuth ? `build-${baseId}-git` : undefined;
    if (pushSecret && req.push?.credentials) await this.k8s.apply(req.ctx, dockerConfigSecretManifest(pushSecret, req.ctx.namespace, req.push.credentials));
    if (gitCredentialsSecret && req.gitAuth) {
      await this.k8s.apply(req.ctx, gitCredentialsSecretManifest(gitCredentialsSecret, req.ctx.namespace, req.gitAuth.username, req.gitAuth.password));
    }
    return { pushSecret, gitCredentialsSecret };
  }

  /** Remove os secrets efêmeros para não acumular. */
  private async removeSecrets(ctx: BuildRequest["ctx"], secrets: { pushSecret?: string; gitCredentialsSecret?: string }): Promise<void> {
    const names = [secrets.pushSecret, secrets.gitCredentialsSecret].filter((name): name is string => Boolean(name));
    await Promise.all(names.map((name) => this.k8s.remove(ctx, "v1", "Secret", name).catch(() => {})));
  }

  /** Detecta falha de conexão/clone do Git nos logs do build (decide o retry de protocolo). */
  private async isGitConnectionError(ctx: BuildRequest["ctx"], jobName: string, container?: string): Promise<boolean> {
    const logs = await this.k8s.podLogsByLabel(ctx, `app.kubernetes.io/name=${jobName}`, 1000, container).catch(() => "");
    return GIT_CONNECTION_ERROR.test(logs);
  }
}
