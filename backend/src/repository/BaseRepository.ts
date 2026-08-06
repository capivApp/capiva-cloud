import type { Prisma } from "@prisma-generated/client";
import { requireTransactionContext } from "@database/context";
import { tenantScope, type TenantScopedModel } from "@database/tenantScope";
import { HttpError } from "@functions/HttpError";

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

  /**
   * Fragmento de `where` que restringe o modelo à organização ativa.
   * Toda busca por id vinda do usuário deve compor este escopo — ver
   * `@database/tenantScope`. Como o filtro deixa de ser por chave única,
   * o método passa a ser `findFirst`/`updateMany`/`deleteMany`.
   */
  protected scope(model: TenantScopedModel): Record<string, unknown> {
    return tenantScope(model);
  }

  /**
   * Guarda de `update`/`delete`: Prisma exige `where` único nessas operações, o
   * que impede compor o escopo de organização direto na query. Confirmamos a
   * posse com uma leitura escopada (mesma transação) antes de mutar.
   */
  protected async ensureScoped<T>(finder: () => Promise<T | null>, entity: string): Promise<T> {
    const row = await finder();
    if (!row) throw HttpError.notFound(`${entity} não encontrado(a) nesta organização.`);
    return row;
  }

  /**
   * Guarda de `create`: as chaves estrangeiras vêm do corpo da requisição, então
   * criar sem conferir permitiria plantar uma aplicação (ou banco, worker, cron)
   * dentro do projeto ou do ambiente de OUTRA organização.
   */
  protected async assertParents(parents: { project?: string; environment?: string }): Promise<void> {
    if (parents.project) {
      await this.ensureScoped(
        () => this.tx.project.findFirst({ where: { id: parents.project, ...this.scope("project") } }),
        "Projeto",
      );
    }
    if (parents.environment) {
      await this.ensureScoped(
        () => this.tx.environment.findFirst({ where: { id: parents.environment, ...this.scope("environment") } }),
        "Ambiente",
      );
    }
  }
}
