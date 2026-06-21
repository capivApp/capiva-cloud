import type { User } from "@prisma-generated/client";

/**
 * Models implementam os tipos gerados pelo Prisma (fonte da verdade).
 * Sem regra de negócio aqui — apenas estrutura/tipagem.
 */
export class UserModel implements User {
  id!: string;
  email!: string;
  name!: string;
  passwordHash!: string;
  avatarUrl!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
}
