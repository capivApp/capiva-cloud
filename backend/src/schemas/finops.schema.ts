import { z } from "zod";

const limiteDe = (rotulo: string) =>
  z
    .number({ error: `Informe ${rotulo} em número inteiro.` })
    .int(`Informe ${rotulo} em número inteiro.`)
    .min(1, `${rotulo[0].toUpperCase()}${rotulo.slice(1)} precisa ser maior que zero.`)
    .nullable()
    .default(null);

/** Quota do ambiente. `null` = sem limite no recurso. */
export const setQuotaSchema = z.object({
  cpuMillicores: limiteDe("o limite de CPU (millicores)"),
  memoryMib: limiteDe("o limite de memória (MiB)"),
  pods: limiteDe("o limite de pods"),
  storageGi: limiteDe("o limite de armazenamento (GiB)"),
});

const PROFILES = ["NANO", "SMALL", "MEDIUM", "LARGE", "XLARGE"] as const;

/** Estimativa do wizard: perfil e réplicas (mínimo e máximo do HPA, opcionais). */
export const estimateAplicacaoSchema = z.object({
  profile: z.enum(PROFILES, { error: "Escolha um perfil válido." }),
  minReplicas: z.coerce
    .number()
    .int()
    .min(1, "Mínimo de réplicas precisa ser ao menos 1.")
    .optional(),
  maxReplicas: z.coerce
    .number()
    .int()
    .min(1, "Máximo de réplicas precisa ser ao menos 1.")
    .optional(),
});

export type SetQuotaDTO = z.infer<typeof setQuotaSchema>;
