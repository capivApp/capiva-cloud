import type { Prisma } from "@prisma-generated/client";
import { requireTransactionContext } from "@database/context";

/**
 * Base de todos os Repositories. Expõe a transação ativa (via AsyncLocalStorage)
 * definida por withTransaction(). Repositories são a ÚNICA camada que acessa
 * Prisma — e sempre dentro de uma transação.
 */
export abstract class BaseRepository {
  protected get tx(): Prisma.TransactionClient {
    return requireTransactionContext().tx;
  }

  protected get organizationId(): string | undefined {
    return requireTransactionContext().tenant.organizationId;
  }
}
