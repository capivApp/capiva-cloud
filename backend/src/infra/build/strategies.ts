import { Injectable, container } from "@di/index";
import { KubernetesAdapter } from "@infra/kubernetes/KubernetesAdapter";
import { dockerConfigSecretManifest, gitCredentialsSecretManifest, kanikoJobManifest } from "@infra/kubernetes/manifests";
import type { BuildRequest, IBuildStrategy } from "@interface/integrations";

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

/** Origem "imagem pronta": nada para construir, apenas referenciar a imagem. */
@Injectable()
export class DockerImageBuildStrategy implements IBuildStrategy {
  supports(source: string): boolean {
    return source === "DOCKER_IMAGE";
  }

  async build(req: BuildRequest): Promise<{ imageRef: string }> {
    const image = (req.config.image as string | undefined) ?? req.imageRef;
    return { imageRef: image };
  }
}

/** Origem por código (Git/buildpacks): build in-cluster via Kaniko Job. */
@Injectable()
export class KanikoBuildStrategy implements IBuildStrategy {
  private static readonly SUPPORTED = new Set([
    "GITHUB",
    "GITLAB",
    "GITEA",
    "DOCKER_COMPOSE",
    "NIXPACKS",
    "RAILPACK",
    "BUILDPACKS",
    "STATIC",
  ]);

  constructor(private readonly k8s: KubernetesAdapter) {}

  supports(source: string): boolean {
    return KanikoBuildStrategy.SUPPORTED.has(source);
  }

  async build(req: BuildRequest): Promise<{ imageRef: string }> {
    const baseId = Date.now().toString(36);
    const push = Boolean(req.push);
    const insecure = req.push?.insecure ?? false;

    // Secrets efêmeros (por build): push (registry com auth) e git (repo privado).
    let pushSecret: string | undefined;
    if (req.push?.credentials) {
      pushSecret = `build-${baseId}-push`;
      await this.k8s.apply(req.ctx, dockerConfigSecretManifest(pushSecret, req.ctx.namespace, req.push.credentials));
    }
    let gitCredentialsSecret: string | undefined;
    if (req.gitAuth) {
      gitCredentialsSecret = `build-${baseId}-git`;
      await this.k8s.apply(req.ctx, gitCredentialsSecretManifest(gitCredentialsSecret, req.ctx.namespace, req.gitAuth.username, req.gitAuth.password));
    }

    try {
      // Tenta os protocolos de clone na ordem preferida (pela URL); só retenta o
      // outro quando o erro é claramente de conexão/clone do Git ("tentar dos dois jeitos").
      const methods = this.gitPullCandidates(req.config);
      let lastError: Error | undefined;
      for (let i = 0; i < methods.length; i++) {
        const jobName = `build-${baseId}-${i}`;
        await this.k8s.apply(req.ctx, kanikoJobManifest({
          name: jobName,
          namespace: req.ctx.namespace,
          context: this.buildContext(req.config),
          dockerfile: (req.config.dockerfile as string | undefined) ?? "Dockerfile",
          imageRef: req.imageRef,
          contextSubPath: req.config.subPath as string | undefined,
          pushSecret,
          gitCredentialsSecret,
          buildArgs: (req.config.buildArgs as { key: string; value: string }[] | undefined) ?? [],
          deploymentId: req.deploymentId,
          push,
          insecure,
          gitPullMethod: methods[i],
        }));
        try {
          await waitForJob(this.k8s, req.ctx, jobName);
          return { imageRef: req.imageRef };
        } catch (error) {
          lastError = error as Error;
          const isLastAttempt = i === methods.length - 1;
          if (isLastAttempt || !(await this.isGitConnectionError(req.ctx, jobName))) throw error;
        }
      }
      throw lastError ?? new Error("Build falhou.");
    } finally {
      // Secrets efêmeros — remove para não acumular.
      if (pushSecret) await this.k8s.remove(req.ctx, "v1", "Secret", pushSecret).catch(() => {});
      if (gitCredentialsSecret) await this.k8s.remove(req.ctx, "v1", "Secret", gitCredentialsSecret).catch(() => {});
    }
  }

  /** Ordem de tentativa do protocolo de clone: o da URL primeiro, depois o outro. */
  private gitPullCandidates(config: Record<string, unknown>): ("http" | "https")[] {
    const repo = (config.repoUrl as string | undefined) ?? (config.repo as string | undefined);
    return repo?.startsWith("http://") ? ["http", "https"] : ["https", "http"];
  }

  /** Detecta falha de conexão/clone do Git nos logs do build (decide o retry de protocolo). */
  private async isGitConnectionError(ctx: BuildRequest["ctx"], jobName: string): Promise<boolean> {
    const logs = await this.k8s.podLogsByLabel(ctx, `app.kubernetes.io/name=${jobName}`).catch(() => "");
    return /connection refused|dial tcp|resolving source context|no such host|x509|tls:|could not read Username|unable to clone|error fetching/i.test(logs);
  }

  private buildContext(config: Record<string, unknown>): string {
    const repo = (config.repoUrl as string | undefined) ?? (config.repo as string | undefined);
    if (!repo) throw new Error("Origem Git sem repositório (repoUrl).");
    const branch = (config.branch as string | undefined) ?? "main";
    return `git://${repo.replace(/^https?:\/\//, "")}#refs/heads/${branch}`;
  }
}

/**
 * Resolver (Factory + Strategy): escolhe a estratégia de build pela origem.
 * Services dependem deste resolver, nunca das implementações concretas.
 */
@Injectable()
export class BuildStrategyResolver {
  private readonly strategies: IBuildStrategy[] = [
    container.get(DockerImageBuildStrategy),
    container.get(KanikoBuildStrategy),
  ];

  resolve(source: string): IBuildStrategy {
    const strategy = this.strategies.find((s) => s.supports(source));
    if (!strategy) throw new Error(`Origem de build não suportada: ${source}`);
    return strategy;
  }
}
