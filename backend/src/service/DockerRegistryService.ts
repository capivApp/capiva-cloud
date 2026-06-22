import { Injectable } from "@di/index";
import { DockerRegistryRepository } from "@repository/DockerRegistryRepository";
import { withTransaction } from "@database/withTransaction";
import { encrypt, decrypt } from "@functions/crypto";
import { HttpError } from "@functions/HttpError";
import type { DockerRegistry } from "@prisma-generated/client";

export interface CreateDockerRegistryInput {
  name: string;
  url: string;
  username: string;
  password: string;
}

/** Credenciais decifradas de um registry (para gerar o imagePullSecret). */
export interface RegistryCredentials {
  url: string;
  username: string;
  password: string;
}

/**
 * Registries Docker privados (org). A senha é cifrada em repouso; o reconciler
 * gera um imagePullSecret no namespace a partir destas credenciais.
 */
@Injectable()
export class DockerRegistryService {
  constructor(private readonly registries: DockerRegistryRepository) {}

  list(organizationId: string): Promise<DockerRegistry[]> {
    return withTransaction(() => this.registries.listByOrganization(organizationId), { tenant: { organizationId } });
  }

  create(organizationId: string, input: CreateDockerRegistryInput): Promise<DockerRegistry> {
    return withTransaction(
      () =>
        this.registries.create({
          organizationId,
          name: input.name,
          url: input.url,
          username: input.username,
          passwordCipher: encrypt(input.password),
        }),
      { tenant: { organizationId } },
    );
  }

  async getById(organizationId: string, id: string): Promise<DockerRegistry> {
    const registry = await withTransaction(() => this.registries.findById(id), { tenant: { organizationId } });
    if (!registry || registry.organizationId !== organizationId) throw HttpError.notFound("Registry não encontrado.");
    return registry;
  }

  async credentials(organizationId: string, id: string): Promise<RegistryCredentials> {
    const registry = await this.getById(organizationId, id);
    return { url: registry.url, username: registry.username, password: decrypt(registry.passwordCipher) };
  }

  async remove(organizationId: string, id: string): Promise<void> {
    await this.getById(organizationId, id);
    await withTransaction(() => this.registries.delete(id), { tenant: { organizationId } });
  }
}
