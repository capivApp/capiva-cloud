import { z } from "zod";

export const createDockerRegistrySchema = z.object({
  name: z.string().min(1),
  url: z.string().min(1, "URL do registry obrigatória"),
  username: z.string().min(1),
  password: z.string().min(1),
});

export const createStorageProviderSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["S3"]).default("S3"),
  endpoint: z.string().min(1),
  bucket: z.string().min(1),
  region: z.string().optional(),
  accessKeyId: z.string().min(1),
  secretAccessKey: z.string().min(1),
  isDefault: z.boolean().default(false),
});

export type CreateDockerRegistryDTO = z.infer<typeof createDockerRegistrySchema>;
export type CreateStorageProviderDTO = z.infer<typeof createStorageProviderSchema>;
