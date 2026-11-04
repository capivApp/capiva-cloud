import { Injectable } from "@di/index";
import { KubernetesAdapter } from "@infra/kubernetes/KubernetesAdapter";
import { trivyCredentialsSecretManifest, trivyJobManifest } from "@infra/security/trivyJob";
import { DEFAULT_TOP_LIMIT, TrivyReportError, extractTrivyReport, parseTrivyReport } from "@infra/security/trivyReport";
import type { KubeContext } from "@interface/integrations";
import type { TrivyFindings } from "@interface/scan";

export interface TrivyScanRequest {
  ctx: KubeContext;
  imageRef: string;
  deploymentId: string;
  /** Credenciais do registry privado (ausente em registry aberto). */
  auth?: { username: string; password: string };
  insecure: boolean;
  limit?: number;
}

/** Falha do próprio scanner (cluster, Job, log). Quem chama decide: nunca bloqueia deploy. */
export class ImageScannerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Log do pod é grande (relatório numa linha + stderr do Trivy): lê bem além do default. */
const LOG_TAIL_LINES = 5_000;

/**
 * Roda o Trivy como Job no cluster do ambiente e devolve o resumo do relatório.
 * Infra pura: não conhece política nem deploy. Toda falha vira exceção; a
 * decisão de bloquear ou seguir fica no ImageScanService.
 */
@Injectable()
export class TrivyScanner {
  pollIntervalMs = 3_000;
  timeoutMs = (Number(process.env.CAPIVA_SCAN_TIMEOUT_SECONDS ?? 600) + 300) * 1000;

  constructor(private readonly k8s: KubernetesAdapter) {}

  async scan(req: TrivyScanRequest): Promise<TrivyFindings> {
    // Sem kubeconfig o adapter opera em simulação: observe() responde "pronto"
    // sem status de Job e o scan esperaria até o timeout por nada.
    if (!req.ctx.kubeconfig) throw new ImageScannerError("Cluster em modo de simulação (sem kubeconfig).");

    const name = `scan-${req.deploymentId}`.toLowerCase().slice(0, 52);
    const credentialsSecret = req.auth ? `${name}-auth` : undefined;
    try {
      if (req.auth && credentialsSecret) {
        await this.k8s.apply(req.ctx, trivyCredentialsSecretManifest(credentialsSecret, req.ctx.namespace, req.auth));
      }
      await this.k8s.apply(req.ctx, trivyJobManifest({ name, namespace: req.ctx.namespace, imageRef: req.imageRef, deploymentId: req.deploymentId, credentialsSecret, insecure: req.insecure }));
      await this.awaitJob(req.ctx, name);
      return await this.readFindings(req.ctx, name, req.limit ?? DEFAULT_TOP_LIMIT);
    } finally {
      // Credencial efêmera: não fica no namespace depois do scan.
      if (credentialsSecret) await this.k8s.remove(req.ctx, "v1", "Secret", credentialsSecret).catch(() => {});
    }
  }

  private async awaitJob(ctx: KubeContext, name: string): Promise<void> {
    const deadline = Date.now() + this.timeoutMs;
    while (Date.now() < deadline) {
      const raw = ((await this.k8s.observe(ctx, "batch/v1", "Job", name)).raw ?? {}) as { succeeded?: number; failed?: number };
      if ((raw.succeeded ?? 0) > 0) return;
      if ((raw.failed ?? 0) > 0) throw new ImageScannerError(`Job ${name} falhou. ${await this.lastLogLine(ctx, name)}`.trim());
      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
    }
    throw new ImageScannerError(`Job ${name} expirou (timeout).`);
  }

  private async readFindings(ctx: KubeContext, name: string, limit: number): Promise<TrivyFindings> {
    const report = extractTrivyReport(await this.logs(ctx, name));
    if (!report) throw new TrivyReportError(`Relatório do Trivy ausente no log do Job ${name}.`);
    return parseTrivyReport(report, limit);
  }

  private logs(ctx: KubeContext, name: string): Promise<string> {
    return this.k8s.podLogsByLabel(ctx, `capiva.cloud/scan-job=${name}`, LOG_TAIL_LINES);
  }

  /** Última linha do log: costuma ser o FATAL do Trivy (registry inacessível, auth negada). */
  private async lastLogLine(ctx: KubeContext, name: string): Promise<string> {
    const logs = await this.logs(ctx, name).catch(() => "");
    return logs.trim().split("\n").pop()?.slice(0, 300) ?? "";
  }
}
