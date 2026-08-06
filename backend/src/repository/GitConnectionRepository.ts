import { Injectable } from "@di/index";
import { BaseRepository } from "@repository/BaseRepository";
import type { GitConnection, Prisma } from "@prisma-generated/client";

@Injectable()
export class GitConnectionRepository extends BaseRepository {
  create(data: Prisma.GitConnectionUncheckedCreateInput): Promise<GitConnection> {
    return this.tx.gitConnection.create({ data });
  }

  listByOrganization(organizationId: string): Promise<GitConnection[]> {
    return this.tx.gitConnection.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" } });
  }

  findById(id: string): Promise<GitConnection | null> {
    return this.tx.gitConnection.findFirst({ where: { id, ...this.scope("gitConnection") } });
  }

  /**
   * Resolução para o WEBHOOK público (`/webhooks/git/:connectionId`), que chega
   * sem sessão e portanto sem organização no contexto. A autenticação desse
   * fluxo é a assinatura HMAC do corpo, validada logo em seguida; a organização
   * sai da própria conexão e passa a escopar todo o resto do processamento.
   */
  findByIdUnscoped(id: string): Promise<GitConnection | null> {
    return this.tx.gitConnection.findUnique({ where: { id } });
  }

  async update(id: string, data: Prisma.GitConnectionUncheckedUpdateInput): Promise<GitConnection> {
    await this.ensureScoped(() => this.findById(id), "Conexão Git");
    return this.tx.gitConnection.update({ where: { id }, data });
  }

  async delete(id: string): Promise<GitConnection> {
    await this.ensureScoped(() => this.findById(id), "Conexão Git");
    return this.tx.gitConnection.delete({ where: { id } });
  }
}
