import { Injectable } from "@di/index";
import { SecretStoreRepository } from "@repository/SecretStoreRepository";
import { KubeContextResolver } from "@service/KubeContextResolver";
import { OperatorInstallerService } from "@service/OperatorInstallerService";
import { KubernetesAdapter } from "@infra/kubernetes/KubernetesAdapter";
import {
  externalSecretManifest,
  externalSecretName,
  secretStoreManifests,
  secretStoreResourceName,
} from "@infra/kubernetes/externalSecretManifests";
import { buildExternalEnvEntries, type StoredEnvVar } from "@functions/containerEnv";
import { withTransaction } from "@database/withTransaction";
import { decrypt, encrypt } from "@functions/crypto";
import { HttpError } from "@functions/HttpError";
import type { KubeContext } from "@interface/integrations";
import type { CreateSecretStoreDTO } from "@schemas/secretStore.schema";
import type { SecretStore } from "@prisma-generated/client";

export type SecretStoreView = Omit<SecretStore, "credentialsCipher">;

export function toSecretStoreView(store: SecretStore): SecretStoreView {
  const { credentialsCipher: _credentials, ...view } = store;
  return view;
}

type Tenant = { organizationId: string };

/**
 * Cofres externos da organização (External Secrets Operator). Credenciais
 * cifradas em repouso e nunca devolvidas. Na reconciliação da aplicação, cada
 * cofre usado vira SecretStore no namespace do ambiente e as variáveis externas
 * viram um ExternalSecret sincronizado num Secret lido pelo Deployment.
 */
@Injectable()
export class SecretStoreService {
  constructor(
    private readonly stores: SecretStoreRepository,
    private readonly kube: KubeContextResolver,
    private readonly k8s: KubernetesAdapter,
    private readonly operators: OperatorInstallerService,
  ) {}

  async list(tenant: Tenant): Promise<SecretStoreView[]> {
    const rows = await withTransaction(() => this.stores.listByOrganization(tenant.organizationId), { tenant });
    return rows.map(toSecretStoreView);
  }

  async create(input: CreateSecretStoreDTO, tenant: Tenant): Promise<SecretStoreView> {
    const created = await withTransaction(async () => {
      if (await this.stores.findByName(tenant.organizationId, input.name)) {
        throw HttpError.conflict("Já existe um cofre com esse nome.");
      }
      return this.stores.create({
        organizationId: tenant.organizationId,
        name: input.name,
        provider: input.provider,
        config: input.config,
        credentialsCipher: encrypt(JSON.stringify(input.credentials)),
      });
    }, { tenant });
    return toSecretStoreView(created);
  }

  async getById(id: string, tenant: Tenant): Promise<SecretStoreView> {
    const store = await withTransaction(() => this.stores.findById(id), { tenant });
    if (!store) throw HttpError.notFound("Cofre externo não encontrado.");
    return toSecretStoreView(store);
  }

  /** Variável só pode apontar para cofre da própria organização. */
  async requireOwned(ids: string[], tenant: Tenant): Promise<void> {
    const unique = [...new Set(ids)];
    if (!unique.length) return;
    const found = await withTransaction(() => this.stores.findManyByIds(unique), { tenant });
    if (found.length === unique.length) return;
    throw HttpError.badRequest("Cofre externo não encontrado.");
  }

  /** Remove o cofre e o SecretStore dos namespaces onde ele foi materializado. */
  async remove(id: string, tenant: Tenant): Promise<void> {
    const environmentIds = await withTransaction(async () => {
      const inUse = await this.stores.listEnvironmentIdsInUse(id);
      await this.stores.delete(id);
      return inUse;
    }, { tenant });
    for (const environmentId of environmentIds) {
      const ctx = await this.kube.forEnvironment(environmentId, tenant);
      await this.removeStoreResources(id, ctx).catch((e) => console.error("[secret-store] remoção:", (e as Error).message));
    }
  }

  /**
   * Materializa no namespace os cofres usados pela aplicação e o ExternalSecret
   * das variáveis externas. Sem variável externa, remove o ExternalSecret (o
   * Secret sincronizado vai junto, por ser `Owner`).
   */
  async syncApplication(appName: string, rows: StoredEnvVar[], ctx: KubeContext, tenant: Tenant): Promise<void> {
    const entries = buildExternalEnvEntries(rows);
    if (!entries.length) {
      await this.k8s.remove(ctx, "external-secrets.io/v1", "ExternalSecret", externalSecretName(appName)).catch(() => undefined);
      return;
    }
    await this.operators.ensure(ctx, "EXTERNAL_SECRETS");
    const stores = await withTransaction(() => this.stores.findManyByIds([...new Set(entries.map((e) => e.storeId))]), { tenant });
    for (const store of stores) {
      for (const manifest of secretStoreManifests(this.toManifestInput(store, ctx.namespace))) await this.k8s.apply(ctx, manifest);
    }
    await this.k8s.apply(ctx, externalSecretManifest(appName, ctx.namespace, entries));
  }

  private toManifestInput(store: SecretStore, namespace: string) {
    return {
      storeId: store.id,
      namespace,
      provider: store.provider,
      config: store.config as Record<string, string>,
      credentials: JSON.parse(decrypt(store.credentialsCipher)) as Record<string, string>,
    };
  }

  private async removeStoreResources(id: string, ctx: KubeContext): Promise<void> {
    const name = secretStoreResourceName(id);
    await this.k8s.remove(ctx, "external-secrets.io/v1", "SecretStore", name);
    await this.k8s.remove(ctx, "v1", "Secret", `${name}-auth`);
  }
}
