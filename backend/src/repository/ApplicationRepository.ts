import { Injectable } from "@di/index";
import { BaseRepository } from "@repository/BaseRepository";
import type { Prisma, Application } from "@prisma-generated/client";

/**
 * Previews por PR que acompanham o registro da aplicação (lista na tela da
 * origem) e, no preview, a origem (marca na lista de aplicações).
 */
const INCLUDE_PREVIEWS = {
  previews: {
    include: { domains: { select: { host: true, tlsMode: true } } },
    orderBy: { previewPrNumber: "asc" },
  },
  previewOf: { select: { id: true, name: true } },
} satisfies Prisma.ApplicationInclude;

export type ApplicationWithPreviews = Prisma.ApplicationGetPayload<{
  include: typeof INCLUDE_PREVIEWS;
}>;

@Injectable()
export class ApplicationRepository extends BaseRepository {
  async create(data: Prisma.ApplicationUncheckedCreateInput): Promise<Application> {
    await this.assertParents({ project: data.projectId, environment: data.environmentId });
    return this.tx.application.create({ data });
  }

  /** Busca restrita à organização ativa (ver BaseRepository.scope). */
  findById(id: string): Promise<ApplicationWithPreviews | null> {
    return this.tx.application.findFirst({
      where: { id, ...this.scope("application") },
      include: INCLUDE_PREVIEWS,
    });
  }

  /** Preview do PR `prNumber` da aplicação de origem. */
  findPreview(previewOfId: string, prNumber: number): Promise<Application | null> {
    return this.tx.application.findFirst({
      where: { previewOfId, previewPrNumber: prNumber, ...this.scope("application") },
    });
  }

  /**
   * Todos os previews, de todas as organizações: só para o scheduler de TTL,
   * que reabre a transação com o tenant de cada um antes de destruir.
   */
  listAllPreviewsWithOrg(): Promise<(Application & { project: { organizationId: string } })[]> {
    return this.tx.application.findMany({
      where: { previewOfId: { not: null } },
      include: { project: { select: { organizationId: true } } },
    });
  }

  listByProject(projectId: string): Promise<Application[]> {
    return this.tx.application.findMany({
      where: { projectId, ...this.scope("application") },
      orderBy: { createdAt: "asc" },
    });
  }

  listByEnvironment(environmentId: string): Promise<Application[]> {
    return this.tx.application.findMany({ where: { environmentId, ...this.scope("application") } });
  }

  /**
   * Aplicações vinculadas a uma conexão Git — usadas no auto-deploy por webhook.
   * O tenant vem da própria conexão (resolvida antes), então segue escopado.
   */
  listByGitConnection(gitConnectionId: string): Promise<Application[]> {
    return this.tx.application.findMany({
      where: { gitConnectionId, ...this.scope("application") },
    });
  }

  async updateStatus(id: string, observedStatus: string): Promise<Application> {
    await this.ensureScoped(() => this.findById(id), "Aplicação");
    return this.tx.application.update({ where: { id }, data: { observedStatus } });
  }

  async update(id: string, data: Prisma.ApplicationUncheckedUpdateInput): Promise<Application> {
    await this.ensureScoped(() => this.findById(id), "Aplicação");
    return this.tx.application.update({ where: { id }, data });
  }

  async delete(id: string): Promise<Application> {
    await this.ensureScoped(() => this.findById(id), "Aplicação");
    return this.tx.application.delete({ where: { id } });
  }
}
