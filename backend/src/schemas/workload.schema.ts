import { z } from "zod";
import { profileKind, sourceKind } from "@schemas/application.schema";

export const createWorkerSchema = z.object({
  projectId: z.string(),
  environmentId: z.string(),
  name: z.string().min(1),
  source: sourceKind,
  sourceConfig: z.record(z.string(), z.unknown()).default({}),
  profile: profileKind.default("SMALL"),
  replicas: z.number().int().min(1).default(1),
});

export const createCronJobSchema = z.object({
  projectId: z.string(),
  environmentId: z.string(),
  name: z.string().min(1),
  schedule: z.string().min(1, "Expressão cron obrigatória"),
  source: sourceKind,
  sourceConfig: z.record(z.string(), z.unknown()).default({}),
  profile: profileKind.default("NANO"),
});

export type CreateWorkerDTO = z.infer<typeof createWorkerSchema>;
export type CreateCronJobDTO = z.infer<typeof createCronJobSchema>;
