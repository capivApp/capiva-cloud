import { Injectable } from "@di/index";
import { BaseRepository } from "@repository/BaseRepository";
import type { Inventario } from "@functions/finops/inventario";

const SELECT_APLICACAO = {
  id: true,
  name: true,
  projectId: true,
  environmentId: true,
  profile: true,
  customResources: true,
  sourceConfig: true,
  previewOfId: true,
  scaling: { select: { minReplicas: true, maxReplicas: true } },
  volumes: { select: { id: true, name: true, sizeGi: true } },
} as const;

const SELECT_BANCO = {
  id: true,
  name: true,
  projectId: true,
  environmentId: true,
  kind: true,
  size: true,
  highAvailability: true,
} as const;

/**
 * Inventário do que consome cluster (aplicações com HPA e volumes, bancos
 * gerenciados), para quota e custo. Só acesso a dados; o cálculo vive em
 * `@functions/finops`.
 */
@Injectable()
export class FinOpsRepository extends BaseRepository {
  private async findInventario(where: Record<string, unknown>): Promise<Inventario> {
    const [aplicacoes, bancos] = await Promise.all([
      this.tx.application.findMany({
        where: { ...where, ...this.scope("application") },
        select: SELECT_APLICACAO,
        orderBy: { createdAt: "asc" },
      }),
      this.tx.managedDatabase.findMany({
        where: { ...where, ...this.scope("managedDatabase") },
        select: SELECT_BANCO,
        orderBy: { createdAt: "asc" },
      }),
    ]);
    return { aplicacoes, bancos };
  }

  findInventarioDoAmbiente(environmentId: string): Promise<Inventario> {
    return this.findInventario({ environmentId });
  }

  findInventarioDaOrganizacao(): Promise<Inventario> {
    return this.findInventario({});
  }

  findNomesDaOrganizacao(): Promise<{
    projetos: { id: string; name: string }[];
    ambientes: { id: string; name: string }[];
  }> {
    const select = { id: true, name: true } as const;
    return Promise.all([
      this.tx.project.findMany({
        where: this.scope("project"),
        select,
        orderBy: { createdAt: "asc" },
      }),
      this.tx.environment.findMany({
        where: this.scope("environment"),
        select,
        orderBy: { createdAt: "asc" },
      }),
    ]).then(([projetos, ambientes]) => ({ projetos, ambientes }));
  }
}
