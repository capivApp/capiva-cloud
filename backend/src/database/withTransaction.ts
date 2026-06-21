import prismaClient from "@database/prisma";
import {
  transactionStorage,
  type TenantContext,
  type TransactionContext,
} from "@database/context";

/**
 * Abstração transacional própria da plataforma.
 *
 * Diferente da implementação acoplada a Postgres/RLS do pacote de decorators,
 * esta funciona com PostgreSQL, MySQL e SQLite e:
 *  - propaga a transação via AsyncLocalStorage (Repositories leem ctx.tx);
 *  - injeta contexto multi-tenant (organizationId/userId) na transação;
 *  - mantém ponto de extensão para RLS e auditoria.
 *
 * REGRA: toda operação de banco (SELECT/INSERT/UPDATE/DELETE) deve rodar aqui.
 */
export interface WithTransactionOptions {
  tenant?: TenantContext;
  timeout?: number;
  maxWait?: number;
  isolationLevel?: Parameters<typeof prismaClient.$transaction>[1] extends infer O
    ? O extends { isolationLevel?: infer I }
      ? I
      : never
    : never;
}

export async function withTransaction<T>(
  fn: (ctx: TransactionContext) => Promise<T>,
  options: WithTransactionOptions = {},
): Promise<T> {
  const { tenant = {}, timeout, maxWait, isolationLevel } = options;

  return prismaClient.$transaction(
    async (tx) => {
      const ctx: TransactionContext = { tx, tenant };

      // Ponto de extensão futuro (Postgres): aplicar contexto de RLS aqui, ex.:
      //   await tx.$executeRawUnsafe(`SET LOCAL app.org_id = '${tenant.organizationId}'`);

      return transactionStorage.run(ctx, () => fn(ctx));
    },
    { timeout, maxWait, isolationLevel },
  );
}
