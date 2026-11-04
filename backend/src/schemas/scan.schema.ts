import { z } from "zod";
import { BlockOnSeverity } from "@interface/scan";

const BLOCK_LEVELS = Object.values(BlockOnSeverity) as [BlockOnSeverity, ...BlockOnSeverity[]];

/** Corpo do PUT /applications/:id/security (política de scan de vulnerabilidades). */
export const scanPolicySchema = z.object({
  scanEnabled: z.boolean({ error: "Informe se o scan fica ligado." }),
  blockOnSeverity: z.enum(BLOCK_LEVELS, {
    error: "Escolha entre não bloquear, bloquear críticas ou bloquear altas e críticas.",
  }),
});

/**
 * Leitura TOLERANTE do que já está gravado em `sourceConfig.security`: valor
 * inválido volta ao default do próprio campo em vez de derrubar o deploy.
 */
export const storedScanPolicySchema = z.object({
  scanEnabled: z.boolean().catch(true),
  blockOnSeverity: z.enum(BLOCK_LEVELS).catch(BlockOnSeverity.NONE),
});

export type ScanPolicyDTO = z.infer<typeof scanPolicySchema>;
