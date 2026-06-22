import { Injectable } from "@di/index";
import { DockerRegistryRepository } from "@repository/DockerRegistryRepository";
import { withTransaction } from "@database/withTransaction";
import { encrypt, decrypt } from "@functions/crypto";
import { HttpError } from "@functions/HttpError";
import type { DockerRegistry } from "@prisma-generated/client";

export interface CreateDockerRegistryInput {
  name: string;
  url: string;
  username?: string;
  password?: string;
  isDefault?: boolean;
  insecure?: boolean;
}

/** Credenciais decifradas de um registry (para gerar o imagePullSecret). */
export interface RegistryCredentials {
  url: string;
  username: string;
  password: string;
}

/** Destino de push resolvido (registry padrão) para o build (Kaniko). */
export interface RegistryPushTarget {
  /** Host do registry, sem esquema (ex.: `10.1.2.36:5000`, `ghcr.io`). */
  host: string;
  insecure: boolean;
  /** Credenciais quando o registry exige autenticação; ausente em registries abertos. */
  credentials?: RegistryCredentials;
}

/**
 * Registries Docker (org). A senha é cifrada em repouso. Suporta registries
 * privados (imagePullSecret), o registry de destino PADRÃO para o push das
 * imagens construídas, registries SEM autenticação e registries inseguros (HTTP).
 */
@Injectable()
export class DockerRegistryService {
  constructor(private readonly registries: DockerRegistryRepository) {}

  list(organizationId: string): Promise<DockerRegistry[]> {
    return withTransaction(() => this.registries.listByOrganization(organizationId), { tenant: { organizationId } });
  }

  create(organizationId: string, input: CreateDockerRegistryInput): Promise<DockerRegistry> {
    return withTransaction(async () => {
      if (input.isDefault) await this.registries.clearDefault(organizationId);
      return this.registries.create({
        organizationId,
        name: input.name,
        url: input.url,
        username: input.username ?? "",
        passwordCipher: input.password ? encrypt(input.password) : "",
        isDefault: input.isDefault ?? false,
        // HTTP → inseguro por padrão (registry local sem TLS); respeita override explícito.
        insecure: input.insecure ?? input.url.startsWith("http://"),
      });
    }, { tenant: { organizationId } });
  }

  async getById(organizationId: string, id: string): Promise<DockerRegistry> {
    const registry = await withTransaction(() => this.registries.findById(id), { tenant: { organizationId } });
    if (!registry || registry.organizationId !== organizationId) throw HttpError.notFound("Registry não encontrado.");
    return registry;
  }

  async credentials(organizationId: string, id: string): Promise<RegistryCredentials> {
    const registry = await this.getById(organizationId, id);
    return { url: registry.url, username: registry.username, password: registry.passwordCipher ? decrypt(registry.passwordCipher) : "" };
  }

  /** Marca um registry como padrão (destino do push), garantindo unicidade por org. */
  async setDefault(organizationId: string, id: string): Promise<DockerRegistry> {
    await this.getById(organizationId, id);
    return withTransaction(async () => {
      await this.registries.clearDefault(organizationId);
      return this.registries.update(id, { isDefault: true });
    }, { tenant: { organizationId } });
  }

  /**
   * Credenciais de pull do registry padrão (para o imagePullSecret do deploy).
   * `undefined` quando não há registry padrão ou ele é aberto (sem autenticação).
   */
  async defaultCredentials(organizationId: string): Promise<RegistryCredentials | undefined> {
    const target = await this.defaultPushTarget(organizationId);
    return target?.credentials;
  }

  /** Destino de push (registry padrão da org) ou `null` quando não há nenhum. */
  async defaultPushTarget(organizationId: string): Promise<RegistryPushTarget | null> {
    const registry = await withTransaction(() => this.registries.findDefault(organizationId), { tenant: { organizationId } });
    if (!registry) return null;
    const host = registry.url.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    // url = host (sem esquema) p/ casar a chave `auths` do dockerconfigjson com o destino do push.
    const credentials = registry.username
      ? { url: host, username: registry.username, password: registry.passwordCipher ? decrypt(registry.passwordCipher) : "" }
      : undefined;
    return { host, insecure: registry.insecure, credentials };
  }

  async remove(organizationId: string, id: string): Promise<void> {
    await this.getById(organizationId, id);
    await withTransaction(() => this.registries.delete(id), { tenant: { organizationId } });
  }
}
