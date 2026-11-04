import { z } from "zod";

const required = (message: string) => z.string().trim().min(1, message);

/** Cofre externo: config e credenciais mudam por provedor (união discriminada). */
export const createSecretStoreSchema = z.discriminatedUnion("provider", [
  z.object({
    name: required("Informe um nome."),
    provider: z.literal("AWS_SECRETS_MANAGER"),
    config: z.object({ region: required("Informe a região.") }),
    credentials: z.object({
      accessKeyId: required("Informe o Access Key ID."),
      secretAccessKey: required("Informe o Secret Access Key."),
    }),
  }),
  z.object({
    name: required("Informe um nome."),
    provider: z.literal("VAULT"),
    config: z.object({
      server: z.string().url("Informe a URL do Vault."),
      path: required("Informe o caminho do KV."),
      version: z.enum(["v1", "v2"]).default("v2"),
    }),
    credentials: z.object({ token: required("Informe o token.") }),
  }),
  z.object({
    name: required("Informe um nome."),
    provider: z.literal("GCP_SECRET_MANAGER"),
    config: z.object({ projectId: required("Informe o ID do projeto.") }),
    credentials: z.object({ serviceAccountJson: required("Cole o JSON da service account.") }),
  }),
]);

export type CreateSecretStoreDTO = z.infer<typeof createSecretStoreSchema>;
