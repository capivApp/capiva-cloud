import type { Request, Response } from "express";
import { z } from "zod";
import { Injectable } from "@di/index";
import { BackupConfigService } from "@service/BackupConfigService";
import { tenantOf } from "@functions/tenant";

const schema = z.object({
  s3Endpoint: z.string().min(1),
  s3Bucket: z.string().min(1),
  s3Region: z.string().optional(),
  accessKeyId: z.string().min(1),
  secretAccessKey: z.string().min(1),
  retentionDays: z.number().int().min(1).optional(),
  schedule: z.string().optional(),
});

@Injectable()
export class BackupConfigController {
  constructor(private readonly backups: BackupConfigService) {}

  get = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.backups.get(tenantOf(req).organizationId));
  };

  save = async (req: Request, res: Response): Promise<void> => {
    const dto = schema.parse(req.body);
    const { credentialsCipher, ...rest } = await this.backups.save(tenantOf(req).organizationId, dto);
    res.json(rest);
  };
}
