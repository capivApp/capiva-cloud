import { Injectable } from "@di/index";
import { BackupConfigRepository } from "@repository/BackupConfigRepository";
import { withTransaction } from "@database/withTransaction";
import { encrypt } from "@functions/crypto";
import type { BackupConfig } from "@prisma-generated/client";

export interface SaveBackupConfigInput {
  s3Endpoint: string;
  s3Bucket: string;
  s3Region?: string;
  accessKeyId: string;
  secretAccessKey: string;
  retentionDays?: number;
  schedule?: string;
}

/** Configuração global de armazenamento S3 da organização (backups). */
@Injectable()
export class BackupConfigService {
  constructor(private readonly repo: BackupConfigRepository) {}

  async get(organizationId: string): Promise<Omit<BackupConfig, "credentialsCipher"> | null> {
    const cfg = await withTransaction(() => this.repo.findByOrganization(organizationId), { tenant: { organizationId } });
    if (!cfg) return null;
    const { credentialsCipher, ...rest } = cfg;
    return rest;
  }

  save(organizationId: string, input: SaveBackupConfigInput): Promise<BackupConfig> {
    return withTransaction(
      () =>
        this.repo.upsert(organizationId, {
          s3Endpoint: input.s3Endpoint,
          s3Bucket: input.s3Bucket,
          s3Region: input.s3Region,
          credentialsCipher: encrypt(JSON.stringify({ accessKeyId: input.accessKeyId, secretAccessKey: input.secretAccessKey })),
          retentionDays: input.retentionDays ?? 7,
          schedule: input.schedule ?? "0 3 * * *",
        }),
      { tenant: { organizationId } },
    );
  }
}
