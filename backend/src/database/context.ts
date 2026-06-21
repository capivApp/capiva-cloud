import { AsyncLocalStorage } from "async_hooks";
import type { Prisma } from "@prisma-generated/client";

/**
 * Contexto transacional propagado por AsyncLocalStorage.
 * Repositories leem `tx` daqui — nunca recebem a transação por parâmetro.
 */
export interface TenantContext {
  organizationId?: string;
  userId?: string;
}

export interface TransactionContext {
  tx: Prisma.TransactionClient;
  tenant: TenantContext;
}

export const transactionStorage = new AsyncLocalStorage<TransactionContext>();

export function getTransactionContext(): TransactionContext | undefined {
  return transactionStorage.getStore();
}

export function requireTransactionContext(message?: string): TransactionContext {
  const ctx = transactionStorage.getStore();
  if (!ctx) {
    throw new Error(
      message ??
        "Nenhuma transação ativa. Toda operação de banco deve rodar dentro de withTransaction().",
    );
  }
  return ctx;
}
