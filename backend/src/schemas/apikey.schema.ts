import { z } from "zod";

export const createApiKeySchema = z.object({
  name: z.string().min(1),
  role: z.enum(["OWNER", "ADMIN", "DEVELOPER", "VIEWER"]).default("DEVELOPER"),
  scopes: z.array(z.string()).default([]),
});

export type CreateApiKeyDTO = z.infer<typeof createApiKeySchema>;
