import { isReconcileDeferred } from "@functions/reconcileScope";
import type { PreviewDatabaseMode } from "@service/preview/previewDatabase";
import { Injectable } from "@di/index";
import {
  ApplicationRepository,
  type ApplicationWithPreviews,
} from "@repository/ApplicationRepository";
import { EnvVarRepository } from "@repository/EnvVarRepository";
import { VolumeRepository } from "@repository/VolumeRepository";
import { DomainRepository } from "@repository/DomainRepository";
import { ScalingPolicyRepository } from "@repository/ScalingPolicyRepository";
import { ReconcilerFactory } from "@infra/kubernetes/ReconcilerFactory";
import { KubernetesAdapter } from "@infra/kubernetes/KubernetesAdapter";
import { KubeContextResolver } from "@service/KubeContextResolver";
import { TlsCertificateService } from "@service/TlsCertificateService";
import { DockerRegistryService } from "@service/DockerRegistryService";
import { QuotaService } from "@service/QuotaService";
import { toRecursoDaAplicacao, toRecursoDoVolume } from "@functions/finops/inventario";
import { resolveReplicasFixas } from "@functions/finops/consumo";
import { NetworkPolicyService } from "@service/NetworkPolicyService";
import { SecretStoreService } from "@service/SecretStoreService";
import { buildContainerEnvVars } from "@functions/containerEnv";
import { dockerConfigSecretManifest, type TlsModeManifest } from "@infra/kubernetes/manifests";
import { withTransaction } from "@database/withTransaction";
import { decrypt } from "@functions/crypto";
import { HttpError } from "@functions/HttpError";
import { isValidHostname, tlsModeToStored } from "@functions/hostname";
import type { Application, Prisma, ScalingPolicy } from "@prisma-generated/client";
import type { DeployTrigger } from "@service/git/deployTrigger.strategy";

/** Com HPA ativo o autoscaling é o dono das réplicas; o valor fixo fica gravado, sem efeito. */
export const AVISO_REPLICAS_COM_HPA =
  "O autoscaling está ativo e controla as réplicas. Para usar réplicas fixas, desative o autoscaling.";

export interface CreateApplicationInput {
  projectId: string;
  environmentId: string;
  name: string;
  source: Application["source"];
  /** Conexão Git (origens GitHub/GitLab/Gitea). */
  gitConnectionId?: string;
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
  /** Preview deployment: aplicação de origem e número do PR (ver PreviewDeploymentService). */
  previewOf?: { applicationId: string; prNumber: number };
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
    private readonly volumes: VolumeRepository,
    private readonly domainRepo: DomainRepository,
    private readonly scalingRepo: ScalingPolicyRepository,
    private readonly reconcilers: ReconcilerFactory,
    private readonly kube: KubeContextResolver,
    private readonly k8s: KubernetesAdapter,
    private readonly tlsCerts: TlsCertificateService,
    private readonly registries: DockerRegistryService,
    private readonly quotas: QuotaService,
    private readonly networkPolicies: NetworkPolicyService,
    private readonly secretStores: SecretStoreService,
  ) {}

  /** Recusa antes de gravar a criação que estoura a quota do ambiente. */
  private requireQuotaDaCriacao(
    input: CreateApplicationInput,
    tenant: { organizationId: string },
  ): Promise<void> {
    const app = toRecursoDaAplicacao({
      profile: input.profile ?? "SMALL",
      customResources: null,
      scaling: null,
      sourceConfig: input.sourceConfig,
      previewOfId: input.previewOf?.applicationId ?? null,
    });
    const volumes = (input.volumes ?? [])
      .filter((v) => v.name.trim() && v.mountPath.trim())
      .map(toRecursoDoVolume);
    return this.quotas.requireCabe(
      input.environmentId,
      {
        pedido: [app, ...volumes],
        paths: {
          cpuMillicores: "profile",
          memoryMib: "profile",
          pods: "profile",
          storageGi: "volumes",
        },
      },
      tenant,
    );
  }

  /** Troca de perfil, recursos ou réplicas: desconta o consumo atual da própria aplicação. */
  private requireQuotaDaTroca(
    app: Application,
    next: { profile: string; customResources: unknown; sourceConfig: unknown },
    scaling: ScalingPolicy | null,
    path: string,
    tenant: { organizationId: string },
  ): Promise<void> {
    const atual = {
      profile: app.profile,
      customResources: app.customResources,
      sourceConfig: app.sourceConfig,
      previewOfId: app.previewOfId,
      scaling,
    };
    return this.quotas.requireCabeNaAplicacao(
      app.environmentId,
      { atual, novo: { ...atual, ...next } },
      path,
      tenant,
    );
  }

  /**
   * Réplicas novas numa aplicação que já existe. O reconcile não mexe nas réplicas de um
   * Deployment existente (preserva a escala manual e não briga com o HPA), por isso a
   * escala é aplicada aqui. Canário e blue/green recebem as réplicas pelo próprio reconcile.
   */
  private async applyReplicas(
    app: Application,
    replicas: number | undefined,
    scaling: ScalingPolicy | null,
    tenant: { organizationId: string },
  ): Promise<string | undefined> {
    if (replicas === undefined) return undefined;
    if (scaling && app.rolloutStrategy === "ROLLING") return AVISO_REPLICAS_COM_HPA;
    if (app.rolloutStrategy !== "ROLLING" || app.desiredStatus === "stopped") return undefined;
    const ctx = await this.kube.forEnvironment(app.environmentId, tenant);
    if (!ctx.kubeconfig) return undefined;
    await this.k8s
      .scaleDeployment(ctx, app.name, replicas)
      .catch((e) => console.error("[app] patch scale:", (e as Error).message));
    return undefined;
  }

  listByProject(projectId: string, tenant: { organizationId: string }): Promise<Application[]> {
    return withTransaction(() => this.apps.listByProject(projectId), { tenant });
  }

  async create(
    input: CreateApplicationInput,
    tenant: { organizationId: string },
  ): Promise<Application> {
    // Domínio do wizard vira entidade Domain (o que a UI lista) — não fica no
    // sourceConfig (evita Ingress "primário legado" duplicado na reconcile).
    const { domain: rawDomain, ...sourceWithoutDomain } = input.sourceConfig;
    const host = typeof rawDomain === "string" ? rawDomain.trim().toLowerCase() : "";
    // Build args ficam no sourceConfig (usados pelo builder); envs de runtime viram EnvVar.
    const sourceConfig = { ...sourceWithoutDomain, buildArgs: input.buildArgs ?? [] };
    const tlsMode = input.tlsMode ?? "LETS_ENCRYPT";
    await this.requireQuotaDaCriacao(input, tenant);

    const app = await withTransaction(
      async () => {
        const created = await this.apps.create({
          projectId: input.projectId,
          environmentId: input.environmentId,
          name: input.name,
          source: input.source,
          gitConnectionId: input.gitConnectionId ?? null,
          sourceConfig: sourceConfig,
          tags: input.tags ?? [],
          profile: input.profile ?? "SMALL",
          rolloutStrategy: input.rolloutStrategy ?? "ROLLING",
          port: input.port ?? 3000,
          tlsMode,
          tlsCertificateId: input.tlsCertificateId ?? null,
          registryId: input.registryId ?? null,
          previewOfId: input.previewOf?.applicationId ?? null,
          previewPrNumber: input.previewOf?.prNumber ?? null,
        });
        for (const e of input.env ?? []) {
          if (e.key.trim())
            await this.envVars.upsert({
              applicationId: created.id,
              key: e.key,
              value: e.value,
              source: "MANUAL",
            });
        }
        for (const v of input.volumes ?? []) {
          if (v.name.trim() && v.mountPath.trim()) {
            await this.volumes.create({
              applicationId: created.id,
              name: v.name,
              mountPath: v.mountPath,
              sizeGi: v.sizeGi,
              accessMode: v.accessMode,
            });
          }
        }
        if (host && isValidHostname(host) && !(await this.domainRepo.findByHost(host))) {
          await this.domainRepo.create({
            applicationId: created.id,
            host,
            tlsMode: tlsModeToStored(tlsMode),
            tlsCertificateId: input.tlsCertificateId ?? null,
          });
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
  async reconcile(
    app: Application,
    tenant: { organizationId: string },
    replicas = desiredReplicasOf(app),
    imageOverride?: string,
  ) {
    // capiva.json no deploy: os services gravam; o reconcile do deploy, com a imagem nova, aplica tudo.
    if (isReconcileDeferred()) return { ready: false, replicas: 0 };
    const ctx = await this.kube.forEnvironment(app.environmentId, tenant);
    const cfg = app.sourceConfig as Record<string, unknown>;
    const image = imageOverride ?? (cfg?.image as string) ?? "ghcr.io/capiva/placeholder:latest";
    const domain = cfg?.domain as string | undefined;

    const [envVars, volumes, domainRows, scalingPolicy] = await withTransaction(
      async () =>
        [
          await this.envVars.listByApplication(app.id),
          await this.volumes.listByApplication(app.id),
          await this.domainRepo.listByApplication(app.id),
          await this.scalingRepo.findByApplication(app.id),
        ] as const,
      { tenant },
    );
    const resolvedEnv = buildContainerEnvVars(app.name, envVars, safeDecrypt);
    const volumeSpecs = volumes.map((v) => ({
      name: v.name,
      mountPath: v.mountPath,
      sizeGi: v.sizeGi,
      accessMode: v.accessMode,
    }));

    // NetworkPolicy padrão do namespace (deny-all + liberações + dependências).
    await this.networkPolicies.syncEnvironmentQuietly(app.environmentId, tenant);
    // Cofre externo: SecretStore + ExternalSecret antes do workload que lê o Secret.
    await this.secretStores.syncApplication(app.name, envVars, ctx, tenant).catch((e) => {
      console.error("[app] cofre externo não sincronizado:", (e as Error).message);
    });

    // TLS por domínio: se UPLOADED, decifra o certificado da org para virar Secret.
    const tlsMode = app.tlsMode ?? "LETS_ENCRYPT";
    const tlsCert =
      tlsMode === "UPLOADED" && app.tlsCertificateId
        ? await this.tlsCerts.decrypted(tenant.organizationId, app.tlsCertificateId)
        : undefined;

    // Registry privado: gera o imagePullSecret no namespace antes do workload.
    // Origem por código → imagem publicada no registry PADRÃO (mesmas credenciais
    // de push); origem DOCKER_IMAGE → registry explícito da app (app.registryId).
    let imagePullSecret: string | undefined;
    const pullCreds = app.registryId
      ? await this.registries.credentials(tenant.organizationId, app.registryId)
      : await this.registries.defaultCredentials(tenant.organizationId);
    if (pullCreds) {
      imagePullSecret = `${app.name}-pull`;
      await this.k8s.apply(
        ctx,
        dockerConfigSecretManifest(imagePullSecret, ctx.namespace, pullCreds),
      );
    }

    // Domínios adicionais (CRUD): mapeia o modo TLS e decifra certs UPLOADED por domínio.
    const tlsModeMap = {
      lets_encrypt: "LETS_ENCRYPT",
      uploaded: "UPLOADED",
      none: "NONE",
    } as const;
    const domains = await Promise.all(
      domainRows.map(async (d) => {
        const mode = tlsModeMap[d.tlsMode as keyof typeof tlsModeMap] ?? "LETS_ENCRYPT";
        const cert =
          mode === "UPLOADED" && d.tlsCertificateId
            ? await this.tlsCerts
                .decrypted(tenant.organizationId, d.tlsCertificateId)
                .catch(() => undefined)
            : undefined;
        return { host: d.host, tlsMode: mode, tlsCert: cert };
      }),
    );

    const scaling = scalingPolicy
      ? {
          minReplicas: scalingPolicy.minReplicas,
          maxReplicas: scalingPolicy.maxReplicas,
          metric: scalingPolicy.metric,
          target: scalingPolicy.target,
        }
      : undefined;

    const status = await this.reconcilers.forApplication().reconcile(
      {
        app,
        image,
        replicas,
        envVars: resolvedEnv,
        domain,
        tlsMode,
        tlsCert,
        domains,
        scaling,
        volumes: volumeSpecs,
        imagePullSecret,
      },
      ctx,
    );
    await withTransaction(
      () => this.apps.updateStatus(app.id, status.ready ? "running" : "progressing"),
      { tenant },
    );
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
    await this.quotas.requireCabe(
      app.environmentId,
      { pedido: [toRecursoDoVolume(input)], paths: { storageGi: "sizeGi" } },
      tenant,
    );
    const vol = await withTransaction(
      () =>
        this.volumes.create({
          applicationId,
          name: input.name,
          mountPath: input.mountPath,
          sizeGi: input.sizeGi,
          accessMode: input.accessMode,
        }),
      { tenant },
    );
    await this.reconcile(app, tenant).catch((e) =>
      console.error("[volume] reconcile:", (e as Error).message),
    );
    return vol;
  }

  async removeVolume(
    applicationId: string,
    volumeId: string,
    tenant: { organizationId: string },
  ): Promise<void> {
    const app = await this.getById(applicationId, tenant);
    await withTransaction(() => this.volumes.delete(volumeId), { tenant });
    await this.reconcile(app, tenant).catch((e) =>
      console.error("[volume] reconcile:", (e as Error).message),
    );
  }

  /** Registro completo: inclui os previews por PR (e, no preview, a origem). */
  async getById(id: string, tenant: { organizationId: string }): Promise<ApplicationWithPreviews> {
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
      dockerfile?: string;
      subPath?: string;
      compose?: string;
      autoDeploy?: boolean;
      watchPaths?: string[];
      previewsEnabled?: boolean;
      previewsDatabase?: PreviewDatabaseMode;
      deployTrigger?: DeployTrigger;
      tagPattern?: string;
      replicas?: number;
      buildCommand?: string;
      startCommand?: string;
    },
    tenant: { organizationId: string },
  ): Promise<Application & { aviso?: string }> {
    const app = await this.getById(id, tenant);
    const renaming = Boolean(dto.name && dto.name !== app.name);

    const cfg = { ...((app.sourceConfig as Record<string, unknown>) ?? {}) };
    if (dto.branch !== undefined) cfg.branch = dto.branch;
    if (dto.image !== undefined) cfg.image = dto.image;
    if (dto.healthPath !== undefined) cfg.healthPath = dto.healthPath;
    // Configuração de build: vale no PRÓXIMO deploy (não reconstrói sozinha).
    // String vazia limpa o campo — o builder volta ao default (ex.: "Dockerfile"
    // na raiz) em vez de gravar um caminho vazio que falharia o build.
    for (const key of ["dockerfile", "subPath", "compose", "tagPattern"] as const) {
      const value = dto[key];
      if (value === undefined) continue;
      if (value === "") delete cfg[key];
      else cfg[key] = value;
    }
    if (dto.autoDeploy !== undefined) cfg.autoDeploy = dto.autoDeploy;
    if (dto.watchPaths !== undefined) cfg.watchPaths = dto.watchPaths;
    if (dto.previewsEnabled !== undefined)
      cfg.previews = { ...(cfg.previews ?? {}), enabled: dto.previewsEnabled };
    if (dto.previewsDatabase !== undefined)
      cfg.previews = { ...(cfg.previews ?? {}), database: dto.previewsDatabase };
    if (dto.deployTrigger !== undefined) cfg.deployTrigger = dto.deployTrigger;
    // Réplicas e comandos de build/start (declarados pelo capiva.json ou pela tela).
    for (const key of ["replicas", "buildCommand", "startCommand"] as const) {
      if (dto[key] !== undefined) cfg[key] = dto[key];
    }

    const isRecursoAlterado = dto.profile !== undefined || dto.customResources !== undefined;
    const scaling = await withTransaction(() => this.scalingRepo.findByApplication(app.id), {
      tenant,
    });
    if (isRecursoAlterado || dto.replicas !== undefined) {
      const next = {
        profile: dto.profile ?? app.profile,
        customResources: dto.customResources ?? app.customResources,
        sourceConfig: cfg,
      };
      await this.requireQuotaDaTroca(
        app,
        next,
        scaling,
        isRecursoAlterado ? "profile" : "replicas",
        tenant,
      );
    }

    const data: Prisma.ApplicationUncheckedUpdateInput = {
      sourceConfig: cfg as Prisma.InputJsonValue,
    };
    if (dto.name) data.name = dto.name;
    if (dto.profile) data.profile = dto.profile;
    if (dto.customResources !== undefined)
      data.customResources = dto.customResources as Prisma.InputJsonValue;
    if (dto.port !== undefined) data.port = dto.port;

    // Renomear: remove os recursos de nome antigo antes de recriar com o novo nome.
    // Passa os domínios para apagar os Ingress nomeados pelo nome ANTIGO; NÃO
    // passa volumes — apagar os PVCs aqui destruiria os dados da aplicação.
    if (renaming) {
      const ctx = await this.kube.forEnvironment(app.environmentId, tenant);
      const domainRows = await withTransaction(() => this.domainRepo.listByApplication(app.id), {
        tenant,
      });
      const domains = domainRows.map((d) => ({ host: d.host, tlsMode: "NONE" as TlsModeManifest }));
      await this.reconcilers
        .forApplication()
        .destroy({ app, image: "", domains }, ctx)
        .catch((e) => console.error("[app] destroy (rename):", (e as Error).message));
    }

    const updated = await withTransaction(() => this.apps.update(id, data), { tenant });
    await this.reconcile(updated, tenant).catch((e) =>
      console.error("[app] patch reconcile:", (e as Error).message),
    );
    const aviso = await this.applyReplicas(updated, dto.replicas, scaling, tenant);
    return aviso ? { ...updated, aviso } : updated;
  }

  async updateTags(
    id: string,
    tags: string[],
    tenant: { organizationId: string },
  ): Promise<Application> {
    await this.getById(id, tenant);
    return withTransaction(() => this.apps.update(id, { tags: tags }), { tenant });
  }

  /** Atualiza o modo TLS do domínio e reconcilia o Ingress/Secret. */
  async updateTls(
    id: string,
    input: { tlsMode: TlsModeManifest; tlsCertificateId?: string },
    tenant: { organizationId: string },
  ): Promise<Application> {
    await this.getById(id, tenant);
    if (input.tlsMode === "UPLOADED" && !input.tlsCertificateId) {
      throw HttpError.badRequest("Selecione um certificado para o modo 'uploaded'.");
    }
    const updated = await withTransaction(
      () =>
        this.apps.update(id, {
          tlsMode: input.tlsMode,
          tlsCertificateId: input.tlsCertificateId ?? null,
        }),
      { tenant },
    );
    await this.reconcile(updated, tenant).catch((e) =>
      console.error("[tls] reconcile:", (e as Error).message),
    );
    return updated;
  }

  /** Para a aplicação (escala para 0 réplicas). */
  async stop(id: string, tenant: { organizationId: string }): Promise<Application> {
    const app = await this.getById(id, tenant);
    await this.reconcile(app, tenant, 0);
    return withTransaction(
      () => this.apps.update(id, { desiredStatus: "stopped", observedStatus: "stopped" }),
      { tenant },
    );
  }

  /** Inicia a aplicação novamente. */
  async start(id: string, tenant: { organizationId: string }): Promise<Application> {
    const app = await this.getById(id, tenant);
    await this.reconcile(app, tenant);
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
      spec: {
        template: {
          metadata: { annotations: { "capiva.cloud/restartedAt": new Date().toISOString() } },
        },
      },
    });
  }

  /**
   * Marca os campos "definidos pelo capiva.json" (a tela os mostra somente leitura).
   * `null` limpa a marca quando o arquivo some do repositório. Metadado: não reconcilia.
   */
  async saveCapivaMarker(
    id: string,
    marker: CapivaMarker | null,
    tenant: { organizationId: string },
  ): Promise<Application> {
    return withTransaction(
      async () => {
        const app = await this.getById(id, tenant);
        const { capivaJson: _previous, ...cfg } =
          (app.sourceConfig as Record<string, unknown>) ?? {};
        const next = marker ? { ...cfg, capivaJson: marker } : cfg;
        return this.apps.update(id, { sourceConfig: next as Prisma.InputJsonValue });
      },
      { tenant },
    );
  }

  /** Build args (ARG do Dockerfile) armazenados no sourceConfig. */
  async listBuildArgs(
    id: string,
    tenant: { organizationId: string },
  ): Promise<{ key: string; value: string }[]> {
    const app = await this.getById(id, tenant);
    return (
      ((app.sourceConfig as Record<string, unknown>)?.buildArgs as {
        key: string;
        value: string;
      }[]) ?? []
    );
  }

  /** Substitui os build args (passados como --build-arg no próximo build). */
  async replaceBuildArgs(
    id: string,
    buildArgs: { key: string; value: string }[],
    tenant: { organizationId: string },
  ): Promise<Application> {
    return withTransaction(
      async () => {
        const app = await this.getById(id, tenant);
        const cfg = { ...((app.sourceConfig as Record<string, unknown>) ?? {}), buildArgs };
        return this.apps.update(id, { sourceConfig: cfg });
      },
      { tenant },
    );
  }

  /**
   * Remove a aplicação e seus recursos no cluster. Domínios e volumes são
   * carregados para que o destroy apague também os Ingress por domínio e os
   * PVCs — que de outro modo ficariam órfãos consumindo storage.
   */
  async remove(id: string, tenant: { organizationId: string }): Promise<void> {
    const app = await this.getById(id, tenant);
    // Previews primeiro: o cascade do banco apagaria as linhas e deixaria os
    // recursos deles órfãos no cluster.
    for (const preview of app.previews) await this.remove(preview.id, tenant);
    const ctx = await this.kube.forEnvironment(app.environmentId, tenant);

    const [domainRows, volumeRows] = await withTransaction(
      async () =>
        [
          await this.domainRepo.listByApplication(id),
          await this.volumes.listByApplication(id),
        ] as const,
      { tenant },
    );

    await this.reconcilers.forApplication().destroy(
      {
        app,
        image: "",
        domains: domainRows.map((d) => ({ host: d.host, tlsMode: "NONE" as TlsModeManifest })),
        volumes: volumeRows.map((v) => ({
          name: v.name,
          mountPath: v.mountPath,
          sizeGi: v.sizeGi,
          accessMode: v.accessMode,
        })),
      },
      ctx,
    );
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

/** Campos que o capiva.json declarou no último deploy (a tela os mostra somente leitura). */
export interface CapivaMarker {
  path: string;
  ref: string;
  fields: string[];
  envKeys: string[];
}

/** Réplicas desejadas: as gravadas (tela ou capiva.json) ou o padrão (mesma regra da quota). */
export function desiredReplicasOf(app: {
  sourceConfig: unknown;
  previewOfId?: string | null;
}): number {
  return resolveReplicasFixas(app);
}
