import { Injectable } from "@di/index";
import { S3Client } from "bun";
import { config } from "../../config";
import type { IStorageAdapter } from "@interface/integrations";

/**
 * Adapter de armazenamento S3 (backups/uploads). Usa o S3Client nativo do Bun.
 * Config global por organização sobrescreve estes defaults no fluxo de backup.
 */
@Injectable()
export class S3Adapter implements IStorageAdapter {
  private readonly client = new S3Client({
    endpoint: config.s3.endpoint,
    region: config.s3.region,
    bucket: config.s3.bucket,
    accessKeyId: config.s3.accessKeyId,
    secretAccessKey: config.s3.secretAccessKey,
  });

  async put(key: string, body: Buffer | string): Promise<void> {
    await this.client.write(key, body);
  }

  getUrl(key: string): string {
    return `${config.s3.endpoint}/${config.s3.bucket}/${key}`;
  }
}
