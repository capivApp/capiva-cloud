import { Injectable } from "@di/index";
import { StorageProviderRepository } from "@repository/StorageProviderRepository";
import { withTransaction } from "@database/withTransaction";
import { encrypt, decrypt } from "@functions/crypto";
import { HttpError } from "@functions/HttpError";
import type { StorageProvider } from "@prisma-generated/client";

export interface CreateStorageProviderInput {
  name: string;
  type?: "S3";
  endpoint: string;
  bucket: string;
  region?: string;
  accessKeyId: string;
  secretAccessKey: string;
  isDefault?: boolean;
}

export interface StorageCredentials {
  endpoint: string;
  bucket: string;
  region?: string | null;
  accessKeyId: string;
  secretAccessKey: string;
}

/**
 * Provedores de armazenamento (S3 múltiplos por org). Credenciais cifradas em
 * repouso. Usados como destino de backups de banco e de volume.
 */
@Injectable()
export class StorageProviderService {
  constructor(private readonly providers: StorageProviderRepository) {}

  list(organizationId: string): Promise<StorageProvider[]> {
    return withTransaction(() => this.providers.listByOrganization(organizationId), { tenant: { organizationId } });
  }

  create(organizationId: string, input: CreateStorageProviderInput): Promise<StorageProvider> {
    return withTransaction(async () => {
      if (input.isDefault) await this.providers.clearDefault(organizationId);
      return this.providers.create({
        organizationId,
        name: input.name,
        type: input.type ?? "S3",
        endpoint: input.endpoint,
        bucket: input.bucket,
        region: input.region,
        credentialsCipher: encrypt(JSON.stringify({ accessKeyId: input.accessKeyId, secretAccessKey: input.secretAccessKey })),
        isDefault: input.isDefault ?? false,
      });
    }, { tenant: { organizationId } });
  }

  async getById(organizationId: string, id: string): Promise<StorageProvider> {
    const provider = await withTransaction(() => this.providers.findById(id), { tenant: { organizationId } });
    if (!provider || provider.organizationId !== organizationId) throw HttpError.notFound("Provedor de storage não encontrado.");
    return provider;
  }

  /** Resolve o provider (id específico ou o default da org) com credenciais decifradas. */
  async resolveCredentials(organizationId: string, id?: string): Promise<StorageCredentials> {
    const provider = id
      ? await this.getById(organizationId, id)
      : await withTransaction(() => this.providers.findDefault(organizationId), { tenant: { organizationId } });
    if (!provider) throw HttpError.badRequest("Nenhum provedor de storage configurado.");
    const creds = JSON.parse(decrypt(provider.credentialsCipher)) as { accessKeyId: string; secretAccessKey: string };
    return { endpoint: provider.endpoint, bucket: provider.bucket, region: provider.region, ...creds };
  }

  async remove(organizationId: string, id: string): Promise<void> {
    await this.getById(organizationId, id);
    await withTransaction(() => this.providers.delete(id), { tenant: { organizationId } });
  }
}
