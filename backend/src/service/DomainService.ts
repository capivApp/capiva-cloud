import { Injectable } from "@di/index";
import { DomainRepository } from "@repository/DomainRepository";
import { ApplicationService } from "@service/ApplicationService";
import { KubeContextResolver } from "@service/KubeContextResolver";
import { KubernetesAdapter } from "@infra/kubernetes/KubernetesAdapter";
import { ingressNameFor } from "@infra/kubernetes/manifests";
import { withTransaction } from "@database/withTransaction";
import { HttpError } from "@functions/HttpError";
import { HOST_RE } from "@functions/hostname";
import type { Domain } from "@prisma-generated/client";

export interface AddDomainInput {
  host: string;
  tlsMode?: "lets_encrypt" | "uploaded" | "none";
  tlsCertificateId?: string;
}

/**
 * Domínios customizados de uma aplicação (CRUD). Cada domínio vira um Ingress
 * próprio (Traefik) com TLS por domínio. Mutações reconciliam a app; remoção
 * apaga o Ingress específico no cluster.
 */
@Injectable()
export class DomainService {
  constructor(
    private readonly domains: DomainRepository,
    private readonly apps: ApplicationService,
    private readonly kube: KubeContextResolver,
    private readonly k8s: KubernetesAdapter,
  ) {}

  list(applicationId: string, tenant: { organizationId: string }): Promise<Domain[]> {
    return withTransaction(() => this.domains.listByApplication(applicationId), { tenant });
  }

  async add(applicationId: string, input: AddDomainInput, tenant: { organizationId: string }): Promise<Domain> {
    const app = await this.apps.getById(applicationId, tenant);
    const host = input.host.trim().toLowerCase();
    if (!HOST_RE.test(host)) throw HttpError.badRequest("Domínio inválido (ex.: app.exemplo.com).");

    const tlsMode = input.tlsMode ?? "lets_encrypt";
    if (tlsMode === "uploaded" && !input.tlsCertificateId) {
      throw HttpError.badRequest("Selecione um certificado para o modo 'uploaded'.");
    }

    const existing = await withTransaction(() => this.domains.findByHost(host), { tenant });
    if (existing) throw HttpError.conflict("Este domínio já está em uso.");

    const domain = await withTransaction(
      () => this.domains.create({ applicationId, host, tlsMode, tlsCertificateId: input.tlsCertificateId ?? null }),
      { tenant },
    );
    await this.apps.reconcile(app, tenant).catch((e) => console.error("[domain] reconcile:", (e as Error).message));
    return domain;
  }

  async remove(applicationId: string, domainId: string, tenant: { organizationId: string }): Promise<void> {
    const app = await this.apps.getById(applicationId, tenant);
    const domain = await withTransaction(() => this.domains.findById(domainId), { tenant });
    if (!domain || domain.applicationId !== applicationId) throw HttpError.notFound("Domínio não encontrado.");

    await withTransaction(() => this.domains.delete(domainId), { tenant });

    // Remove o Ingress específico do domínio no cluster (best-effort).
    try {
      const ctx = await this.kube.forEnvironment(app.environmentId, tenant);
      if (ctx.kubeconfig) {
        await this.k8s.remove(ctx, "networking.k8s.io/v1", "Ingress", ingressNameFor(app.name, domain.host));
      }
    } catch (e) {
      console.error("[domain] remove ingress:", (e as Error).message);
    }
  }
}
