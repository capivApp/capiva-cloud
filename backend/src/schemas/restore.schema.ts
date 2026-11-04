import { z } from "zod";

/** Mesmo formato de nome que o Kubernetes aceita para o recurso do banco (DNS-1123). */
const resourceName = z
  .string({ error: "Informe o nome do banco novo." })
  .trim()
  .min(1, "Informe o nome do banco novo.")
  .max(40, "Use no máximo 40 caracteres.")
  .regex(/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/, "Use letras minúsculas, números e hífen.");

/**
 * Corpo do restore de backup de banco. `IN_PLACE` sobrescreve o próprio banco e
 * exige o nome digitado; `AS_COPY` cria um banco novo com o nome informado.
 */
export const restoreBackupSchema = z.discriminatedUnion(
  "mode",
  [
    z.object({
      mode: z.literal("IN_PLACE"),
      confirmName: z.string({ error: "Digite o nome do banco para confirmar." }).min(1, "Digite o nome do banco para confirmar."),
    }),
    z.object({ mode: z.literal("AS_COPY"), newName: resourceName }),
  ],
  { error: "Escolha como restaurar: sobre o banco atual ou como cópia." },
);

export type RestoreBackupDTO = z.infer<typeof restoreBackupSchema>;
