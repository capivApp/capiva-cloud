import { Injectable } from "@di/index";
import { ApplicationRepository } from "@repository/ApplicationRepository";
import { EnvVarRepository } from "@repository/EnvVarRepository";
import { ServiceDependencyRepository } from "@repository/ServiceDependencyRepository";
import { VolumeRepository } from "@repository/VolumeRepository";
import { DomainRepository } from "@repository/DomainRepository";
import { ScalingPolicyRepository } from "@repository/ScalingPolicyRepository";
import { ReconcilerFactory } from "@infra/kubernetes/ReconcilerFactory";
import { KubernetesAdapter } from "@infra/kubernetes/KubernetesAdapter";
import { KubeContextResolver } from "@service/KubeContextResolver";
import { TlsCertificateService } from "@service/TlsCertificateService";
import { DockerRegistryService } from "@service/DockerRegistryService";
import { dockerConfigSecretManifest, type TlsModeManifest } from "@infra/kubernetes/manifests";
import { withTransaction } from "@database/withTransaction";
import { decrypt } from "@functions/crypto";
import { HttpError } from "@functions/HttpError";
import type { Application, Prisma } from "@prisma-generated/client";

export interface CreateApplicationInput {
  projectId: string;
  environmentId: string;
  name: string;
  source: Application["source"];
  sourceConfig: Record<string, unknown>;
  profile?: Application["profile"];
  rolloutStrategy?: Application["rolloutStrategy"];
  port?: number;
  /** Variáveis de runtime (vão para o container). */
  env?: { key: string; value: string }[];
  /** Variáveis de build (build args). */
  buildArgs?: { key: string; value: string }[];
  tags?: string[];
  volumes?: { name: string; mountPath: string; sizeGi: number; accessMode: "RWO" | "RWX" }[];
  /** Modo TLS do domínio: lets_encrypt | uploaded | none. */
  tlsMode?: TlsModeManifest;
  /** Quando UPLOADED, qual certificado da org usar. */
  tlsCertificateId?: string;
  /** Registry privado (gera imagePullSecret). */
  registryId?: string;
}

/**
 * Regras de aplicação: cria a entidade (estado desejado), reconcilia para o
 * cluster e gerencia o ciclo de vida (stop/restart/remove). O usuário nunca vê
 * Deployment/Service/Ingress — só a abstração "aplicação".
 */
@Injectable()
export class ApplicationService {
  constructor(
    private readonly apps: ApplicationRepository,
    private readonly envVars: EnvVarRepository,
    private readonly deps: ServiceDependencyRepository,
    private readonly volumes: VolumeRepository,
    private readonly domainRepo: DomainRepository,
    private readonly scalingRepo: ScalingPolicyRepository,
    private readonly reconcilers: ReconcilerFactory,
    private readonly kube: KubeContextResolver,
    private readonly k8s: KubernetesAdapter,
    private readonly tlsCerts: TlsCertificateService,
    private readonly registries: DockerRegistryService,
  ) {}

  listByProject(projectId: string, tenant: { organizationId: string }): Promise<Application[]> {
    return withTransaction(() => this.apps.listByProject(projectId), { tenant });
  }

  async create(input: CreateApplicationInput, tenant: { organizationId: string }): Promise<Application> {
    // Build args ficam no sourceConfig (usados pelo builder); envs de runtime viram EnvVar.
    const sourceConfig = { ...input.sourceConfig, buildArgs: input.buildArgs ?? [] };

    const app = await withTransaction(
      async () => {
        const created = await this.apps.create({
          projectId: input.projectId,
          environmentId: input.environmentId,
          name: input.name,
          source: input.source,
          sourceConfig: sourceConfig as Prisma.InputJsonValue,
          tags: (input.tags ?? []) as Prisma.InputJsonValue,
          profile: input.profile ?? "SMALL",
          rolloutStrategy: input.rolloutStrategy ?? "ROLLING",
          port: input.port ?? 3000,
          tlsMode: input.tlsMode ?? "LETS_ENCRYPT",
          tlsCertificateId: input.tlsCertificateId ?? null,
          registryId: input.registryId ?? null,
        });
        for (const e of input.env ?? []) {
          if (e.key.trim()) await this.envVars.upsert({ applicationId: created.id, key: e.key, value: e.value, source: "MANUAL" });
        }
        for (const v of input.volumes ?? []) {
          if (v.name.trim() && v.mountPath.trim()) {
            await this.volumes.create({ applicationId: created.id, name: v.name, mountPath: v.mountPath, sizeGi: v.sizeGi, accessMode: v.accessMode });
          }
        }
        return created;
      },
      { tenant },
    );
    // Reconciliação não-fatal na criação: recursos faltantes (ex.: CRD do Argo
    // Rollouts) não devem impedir a criação — o status reflete o estado.
    try {
      await this.reconcile(app, tenant);
    } catch (error) {
      console.error("[app] reconcile falhou na criação:", (error as Error).message);
      await withTransaction(() => this.apps.updateStatus(app.id, "error"), { tenant });
    }
    return app;
  }

  /** Reconcilia a aplicação (idempotente). Atualiza e retorna o estado observado. */
  async reconcile(app: Application, tenant: { organizationId: string }, replicas = 2, imageOverride?: string) {
    const ctx = await this.kube.forEnvironment(app.environmentId, tenant);
    const cfg = app.sourceConfig as Record<string, unknown>;
    const image = imageOverride ?? (cfg?.image as string) ?? "ghcr.io/capiva/placeholder:latest";
    const domain = cfg?.domain as string | undefined;

    const [envVars, deps, volumes, domainRows, scalingPolicy] = await withTransaction(
      async () =>
        [
          await this.envVars.listByApplication(app.id),
          await this.deps.listForApplication(app.id),
          await this.volumes.listByApplication(app.id),
          await this.domainRepo.listByApplication(app.id),
          await this.scalingRepo.findByApplication(app.id),
        ] as const,
      { tenant },
    );
    const resolvedEnv = envVars.map((e) => ({ key: e.key, value: e.secret ? safeDecrypt(e.value) : e.value }));
    const volumeSpecs = volumes.map((v) => ({ name: v.name, mountPath: v.mountPath, sizeGi: v.sizeGi, accessMode: v.accessMode as "RWO" | "RWX" }));

    // Origens que dependem desta app (target == app) → liberadas na NetworkPolicy.
    const allowedSourceIds = deps.filter((d) => d.targetId === app.id).map((d) => d.sourceId);
    const allowedFrom = await withTransaction(
      async () => (await Promise.all(allowedSourceIds.map((id) => this.apps.findById(id)))).flatMap((a) => (a ? [a.name] : [])),
      { tenant },
    );

    // TLS por domínio: se UPLOADED, decifra o certificado da org para virar Secret.
    const tlsMode = (app.tlsMode ?? "LETS_ENCRYPT") as TlsModeManifest;
    const tlsCert =
      tlsMode === "UPLOADED" && app.tlsCertificateId
        ? await this.tlsCerts.decrypted(tenant.organizationId, app.tlsCertificateId)
        : undefined;

    // Registry privado: gera o imagePullSecret no namespace antes do workload.
    let imagePullSecret: string | undefined;
    if (app.registryId) {
      const creds = await this.registries.credentials(tenant.organizationId, app.registryId);
      imagePullSecret = `${app.name}-pull`;
      await this.k8s.apply(ctx, dockerConfigSecretManifest(imagePullSecret, ctx.namespace, creds));
    }

    // Domínios adicionais (CRUD): mapeia o modo TLS e decifra certs UPLOADED por domínio.
    const tlsModeMap = { lets_encrypt: "LETS_ENCRYPT", uploaded: "UPLOADED", none: "NONE" } as const;
    const domains = await Promise.all(
      domainRows.map(async (d) => {
        const mode = (tlsModeMap[d.tlsMode as keyof typeof tlsModeMap] ?? "LETS_ENCRYPT") as TlsModeManifest;
        const cert =
          mode === "UPLOADED" && d.tlsCertificateId
            ? await this.tlsCerts.decrypted(tenant.organizationId, d.tlsCertificateId).catch(() => undefined)
            : undefined;
        return { host: d.host, tlsMode: mode, tlsCert: cert };
      }),
    );

    const scaling = scalingPolicy
      ? { minReplicas: scalingPolicy.minReplicas, maxReplicas: scalingPolicy.maxReplicas, metric: scalingPolicy.metric, target: scalingPolicy.target }
      : undefined;

    const status = await this.reconcilers.forApplication().reconcile(
      { app, image, replicas, envVars: resolvedEnv, allowedFrom, domain, tlsMode, tlsCert, domains, scaling, volumes: volumeSpecs, imagePullSecret },
      ctx,
    );
    await withTransaction(() => this.apps.updateStatus(app.id, status.ready ? "running" : "progressing"), { tenant });
    return status;
  }

  /** Lista volumes da aplicação. */
  listVolumes(applicationId: string, tenant: { organizationId: string }) {
    return withTransaction(() => this.volumes.listByApplication(applicationId), { tenant });
  }

  /** Cria um volume e reconcilia (PVC + mount). */
  async addVolume(
    applicationId: string,
    input: { name: string; mountPath: string; sizeGi: number; accessMode: "RWO" | "RWX" },
    tenant: { organizationId: string },
  ) {
    const app = await this.getById(applicationId, tenant);
    const vol = await withTransaction(
      () => this.volumes.create({ applicationId, name: input.name, mountPath: input.mountPath, sizeGi: input.sizeGi, accessMode: input.accessMode }),
      { tenant },
    );
    await this.reconcile(app, tenant).catch((e) => console.error("[volume] reconcile:", (e as Error).message));
    return vol;
  }

  async removeVolume(applicationId: string, volumeId: string, tenant: { organizationId: string }): Promise<void> {
    const app = await this.getById(applicationId, tenant);
    await withTransaction(() => this.volumes.delete(volumeId), { tenant });
    await this.reconcile(app, tenant).catch((e) => console.error("[volume] reconcile:", (e as Error).message));
  }

  async getById(id: string, tenant: { organizationId: string }): Promise<Application> {
    const app = await withTransaction(() => this.apps.findById(id), { tenant });
    if (!app) throw HttpError.notFound("Aplicação não encontrada.");
    return app;
  }

  /**
   * Configurações gerais da app: nome, perfil/recursos, porta, branch/imagem e
   * health check. Renomear destrói os recursos de nome antigo antes de reconciliar
   * (breve indisponibilidade — os recursos k8s são nomeados pela app).
   */
  async patch(
    id: string,
    dto: {
      name?: string;
      profile?: Application["profile"];
      customResources?: Record<string, unknown>;
      port?: number;
      branch?: string;
      image?: string;
      healthPath?: string;
    },
    tenant: { organizationId: string },
  ): Promise<Application> {
    const app = await this.getById(id, tenant);
    const renaming = Boolean(dto.name && dto.name !== app.name);

    const cfg = { ...((app.sourceConfig as Record<string, unknown>) ?? {}) };
    if (dto.branch !== undefined) cfg.branch = dto.branch;
    if (dto.image !== undefined) cfg.image = dto.image;
    if (dto.healthPath !== undefined) cfg.healthPath = dto.healthPath;

    const data: Prisma.ApplicationUncheckedUpdateInput = { sourceConfig: cfg as Prisma.InputJsonValue };
    if (dto.name) data.name = dto.name;
    if (dto.profile) data.profile = dto.profile;
    if (dto.customResources !== undefined) data.customResources = dto.customResources as Prisma.InputJsonValue;
    if (dto.port !== undefined) data.port = dto.port;

    // Renomear: remove os recursos de nome antigo antes de recriar com o novo nome.
    if (renaming) {
      const ctx = await this.kube.forEnvironment(app.environmentId, tenant);
      await this.reconcilers.forApplication().destroy({ app, image: "" }, ctx).catch((e) => console.error("[app] destroy (rename):", (e as Error).message));
    }

    const updated = await withTransaction(() => this.apps.update(id, data), { tenant });
    await this.reconcile(updated, tenant).catch((e) => console.error("[app] patch reconcile:", (e as Error).message));
    return updated;
  }

  async updateTags(id: string, tags: string[], tenant: { organizationId: string }): Promise<Application> {
    await this.getById(id, tenant);
    return withTransaction(() => this.apps.update(id, { tags: tags as Prisma.InputJsonValue }), { tenant });
  }

  /** Atualiza o modo TLS do domínio e reconcilia o Ingress/Secret. */
  async updateTls(
    id: string,
    input: { tlsMode: TlsModeManifest; tlsCertificateId?: string },
    tenant: { organizationId: string },
  ): Promise<Application> {
    const app = await this.getById(id, tenant);
    if (input.tlsMode === "UPLOADED" && !input.tlsCertificateId) {
      throw HttpError.badRequest("Selecione um certificado para o modo 'uploaded'.");
    }
    const updated = await withTransaction(
      () => this.apps.update(id, { tlsMode: input.tlsMode, tlsCertificateId: input.tlsCertificateId ?? null }),
      { tenant },
    );
    await this.reconcile(updated, tenant).catch((e) => console.error("[tls] reconcile:", (e as Error).message));
    return updated;
  }

  /** Para a aplicação (escala para 0 réplicas). */
  async stop(id: string, tenant: { organizationId: string }): Promise<Application> {
    const app = await this.getById(id, tenant);
    await this.reconcile(app, tenant, 0);
    return withTransaction(() => this.apps.update(id, { desiredStatus: "stopped", observedStatus: "stopped" }), { tenant });
  }

  /** Inicia a aplicação novamente. */
  async start(id: string, tenant: { organizationId: string }): Promise<Application> {
    const app = await this.getById(id, tenant);
    await this.reconcile(app, tenant, 2);
    return withTransaction(() => this.apps.update(id, { desiredStatus: "running" }), { tenant });
  }

  /** Reinicia os pods (rollout restart via annotation de template). */
  async restart(id: string, tenant: { organizationId: string }): Promise<void> {
    const app = await this.getById(id, tenant);
    const ctx = await this.kube.forEnvironment(app.environmentId, tenant);
    await this.k8s.apply(ctx, {
      apiVersion: "apps/v1",
      kind: "Deployment",
      metadata: { name: app.name, namespace: ctx.namespace },
      spec: { template: { metadata: { annotations: { "capiva.cloud/restartedAt": new Date().toISOString() } } } },
    });
  }

  /** Remove a aplicação e seus recursos no cluster. */
  async remove(id: string, tenant: { organizationId: string }): Promise<void> {
    const app = await this.getById(id, tenant);
    const ctx = await this.kube.forEnvironment(app.environmentId, tenant);
    await this.reconcilers.forApplication().destroy({ app, image: "" }, ctx);
    await withTransaction(() => this.apps.delete(id), { tenant });
  }
}

function safeDecrypt(value: string): string {
  try {
    return decrypt(value);
  } catch {
    return value;
  }
}
