import { Injectable } from "@di/index";
import { ServiceDependencyRepository } from "@repository/ServiceDependencyRepository";
import { ApplicationRepository } from "@repository/ApplicationRepository";
import { EnvVarRepository } from "@repository/EnvVarRepository";
import { EnvironmentRepository } from "@repository/EnvironmentRepository";
import { KubeContextResolver } from "@service/KubeContextResolver";
import { KubernetesAdapter } from "@infra/kubernetes/KubernetesAdapter";
import { withTransaction } from "@database/withTransaction";
import { HttpError } from "@functions/HttpError";
import type { Prisma, ServiceDependency } from "@prisma-generated/client";

/** Forma do valor que a variável injetada deve assumir. */
export type EnvForm = "URL" | "DNS" | "DNS_PORT" | "IP" | "IP_PORT";

export interface EnvMapping {
  /** nome da variável na ORIGEM (ex.: DATABASE_HOST, API_URL) */
  key: string;
  /** o que ela representa: URL completa, DNS, DNS+porta, IP, IP+porta */
  form: EnvForm;
}

function defaultKey(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

/**
 * Dependências entre aplicações (grafo). Ao conectar, o usuário define QUAIS
 * variáveis injetar na ORIGEM e O QUE cada uma é (URL, DNS, DNS+porta, IP,
 * IP+porta). A plataforma gera o DNS interno do Kubernetes e o valor adequado.
 */
@Injectable()
export class DependencyService {
  constructor(
    private readonly deps: ServiceDependencyRepository,
    private readonly apps: ApplicationRepository,
    private readonly envVars: EnvVarRepository,
    private readonly environments: EnvironmentRepository,
    private readonly kube: KubeContextResolver,
    private readonly k8s: KubernetesAdapter,
  ) {}

  listForApplication(applicationId: string, tenant: { organizationId: string }): Promise<ServiceDependency[]> {
    return withTransaction(() => this.deps.listForApplication(applicationId), { tenant });
  }

  async connect(
    sourceId: string,
    targetId: string,
    mappings: EnvMapping[] | undefined,
    tenant: { organizationId: string },
  ): Promise<ServiceDependency> {
    if (sourceId === targetId) throw HttpError.badRequest("Uma aplicação não pode depender de si mesma.");

    const { source, target, namespace } = await withTransaction(async () => {
      const source = await this.apps.findById(sourceId);
      const target = await this.apps.findById(targetId);
      if (!source || !target) throw HttpError.notFound("Aplicação de origem ou destino não encontrada.");
      if (await this.deps.find(sourceId, targetId)) throw HttpError.conflict("Dependência já existe.");
      const env = await this.environments.findById(target.environmentId);
      return { source, target, namespace: env?.namespace ?? "default" };
    }, { tenant });

    const effective: EnvMapping[] = mappings?.length
      ? mappings
      : [{ key: `${defaultKey(target.name)}_URL`, form: "URL" }];

    const port = target.port ?? 80;
    const fqdn = `${target.name}.${namespace}.svc.cluster.local`;

    // Resolve o ClusterIP só se algum mapping pedir IP (e houver cluster real).
    let ip: string | null = null;
    if (effective.some((m) => m.form === "IP" || m.form === "IP_PORT")) {
      const ctx = await this.kube.forEnvironment(target.environmentId, tenant);
      ip = await this.k8s.getServiceIP(ctx, target.name);
    }

    const valueFor = (form: EnvForm): string => {
      switch (form) {
        case "URL": return `http://${fqdn}:${port}`;
        case "DNS": return fqdn;
        case "DNS_PORT": return `${fqdn}:${port}`;
        case "IP": return ip ?? fqdn;
        case "IP_PORT": return ip ? `${ip}:${port}` : `${fqdn}:${port}`;
      }
    };

    return withTransaction(async () => {
      for (const m of effective) {
        await this.envVars.upsert({ applicationId: sourceId, key: m.key, value: valueFor(m.form), source: "INJECTED" });
      }
      return this.deps.create({
        sourceId,
        targetId,
        injectedKeys: effective as unknown as Prisma.InputJsonValue,
      });
    }, { tenant });
  }

  disconnect(id: string, tenant: { organizationId: string }): Promise<void> {
    return withTransaction(async () => {
      await this.deps.delete(id);
    }, { tenant });
  }
}
