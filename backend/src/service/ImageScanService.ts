import { Injectable } from "@di/index";
import { DeploymentRepository } from "@repository/DeploymentRepository";
import { ApplicationRepository } from "@repository/ApplicationRepository";
import { DockerRegistryService } from "@service/DockerRegistryService";
import { TrivyScanner } from "@infra/security/TrivyScanner";
import { deploymentEvents } from "@infra/realtime/EventBus";
import { withTransaction } from "@database/withTransaction";
import { HttpError } from "@functions/HttpError";
import { readScanPolicy } from "@service/scan/scanPolicy.strategy";
import { buildScanErrorSummary, buildScanSummary } from "@service/scan/scanSummary";
import { ScanStatus, type ScanPolicy, type ScanSummary } from "@interface/scan";
import type { KubeContext } from "@interface/integrations";
import type { Application, Prisma } from "@prisma-generated/client";

type Tenant = { organizationId: string };

export interface ImageScanStep {
  deploymentId: string;
  app: Application;
  imageRef: string;
  ctx: KubeContext;
  tenant: Tenant;
}

interface RegistryAuth {
  auth?: { username: string; password: string };
  insecure: boolean;
}

/** Deploy barrado pela política de scan. Carrega a mensagem pronta para o usuário. */
export class ImageScanBlockedError extends HttpError {
  constructor(message: string) {
    super(message, 422, "IMAGE_SCAN_BLOCKED");
    this.name = "ImageScanBlockedError";
  }
}

/** Progresso exibido enquanto o scan roda (entre "Imagem publicada" e "Deploy iniciado"). */
const SCAN_PROGRESS = { status: "PUSHING", progress: 50 } as const;

/**
 * Passo de scan de vulnerabilidades do deploy (Trivy). Lê a política da app,
 * roda o scanner, grava o resumo no Deployment e registra a timeline.
 *
 * Só a política bloqueia: falha do PRÓPRIO scanner (timeout, registry
 * inacessível, cluster em simulação) vira aviso e o deploy segue.
 */
@Injectable()
export class ImageScanService {
  constructor(
    private readonly scanner: TrivyScanner,
    private readonly deployments: DeploymentRepository,
    private readonly apps: ApplicationRepository,
    private readonly registries: DockerRegistryService,
  ) {}

  /** Roda o scan do deploy. Lança ImageScanBlockedError quando a política barra a imagem. */
  async guard(step: ImageScanStep): Promise<void> {
    const policy = readScanPolicy(step.app.sourceConfig);
    if (!policy.scanEnabled)
      return this.record(step, "Scan de vulnerabilidades desligado nesta aplicação");

    await this.record(step, "Scan de vulnerabilidades iniciado");
    const summary = await this.scan(step, policy);
    await this.persist(step, summary);
    await this.record(step, summary.message, summary.error);
    if (summary.status === ScanStatus.BLOCKED) throw new ImageScanBlockedError(summary.message);
  }

  /** Grava a política em `sourceConfig.security`. Vale a partir do próximo deploy. */
  savePolicy(applicationId: string, policy: ScanPolicy, tenant: Tenant): Promise<Application> {
    return withTransaction(
      async () => {
        const app = await this.apps.findById(applicationId);
        if (!app) throw HttpError.notFound("Aplicação não encontrada.");
        const sourceConfig = {
          ...((app.sourceConfig as Record<string, unknown>) ?? {}),
          security: { ...policy },
        };
        return this.apps.update(applicationId, { sourceConfig: sourceConfig });
      },
      { tenant },
    );
  }

  private async scan(step: ImageScanStep, policy: ScanPolicy): Promise<ScanSummary> {
    const base = { imageRef: step.imageRef, scannedAt: new Date(), policy };
    try {
      const registry = await this.resolveRegistryAuth(step.app, step.tenant);
      const findings = await this.scanner.scan({
        ctx: step.ctx,
        imageRef: step.imageRef,
        deploymentId: step.deploymentId,
        ...registry,
      });
      return buildScanSummary({ ...base, findings });
    } catch (error) {
      console.error("[scan] scanner falhou:", (error as Error).message);
      return buildScanErrorSummary({ ...base, reason: (error as Error).message });
    }
  }

  /**
   * Mesmas credenciais do imagePullSecret do deploy (ApplicationService.reconcile):
   * registry explícito da app (DOCKER_IMAGE) ou o registry padrão da org (build).
   */
  private async resolveRegistryAuth(app: Application, tenant: Tenant): Promise<RegistryAuth> {
    if (app.registryId) return this.explicitRegistryAuth(tenant.organizationId, app.registryId);
    const target = await this.registries.defaultPushTarget(tenant.organizationId);
    return { insecure: target?.insecure ?? false, auth: target?.credentials };
  }

  private async explicitRegistryAuth(
    organizationId: string,
    registryId: string,
  ): Promise<RegistryAuth> {
    const registry = await this.registries.getById(organizationId, registryId);
    const credentials = await this.registries.credentials(organizationId, registryId);
    return { insecure: registry.insecure, auth: credentials.username ? credentials : undefined };
  }

  private persist(step: ImageScanStep, summary: ScanSummary): Promise<unknown> {
    return withTransaction(
      () =>
        this.deployments.update(step.deploymentId, {
          scanSummary: summary as unknown as Prisma.InputJsonValue,
        }),
      { tenant: step.tenant },
    );
  }

  private async record(step: ImageScanStep, label: string, detail?: string): Promise<void> {
    await withTransaction(
      () => this.deployments.addEvent({ deploymentId: step.deploymentId, label, detail }),
      { tenant: step.tenant },
    );
    deploymentEvents.emit(step.deploymentId, { label, ...SCAN_PROGRESS });
  }
}
