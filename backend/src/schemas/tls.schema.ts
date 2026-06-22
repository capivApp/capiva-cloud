import { z } from "zod";

const pem = (label: string) => z.string().min(1, `${label} obrigatório`).includes("-----BEGIN", { message: `${label} deve ser PEM` });

export const createTlsCertificateSchema = z.object({
  name: z.string().min(1),
  cert: pem("Certificado"),
  key: pem("Chave privada"),
});

export type CreateTlsCertificateDTO = z.infer<typeof createTlsCertificateSchema>;
