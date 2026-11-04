import { Injectable } from "@di/index";
import { FinOpsRepository } from "@repository/FinOpsRepository";
import { EnvironmentRepository } from "@repository/EnvironmentRepository";
import { ReconcilerFactory } from "@infra/kubernetes/ReconcilerFactory";
import { KubeContextResolver } from "@service/KubeContextResolver";
import { withTransaction } from "@database/withTransaction";
import { HttpError } from "@functions/HttpError";
import {
  requireCabeNaQuota,
  toColunasDeQuota,
  toLimiteDoAmbiente,
  type PedidoDeQuota,
} from "@functions/finops/checagem";
import {
  buildUsoDoInventario,
  toRecursoDaAplicacao,
  type RecursoDaAplicacaoInput,
} from "@functions/finops/inventario";
import { buildDisponivel, type QuotaLimite } from "@functions/finops/quota";
import type { Consumo, RecursoDeConsumo } from "@functions/finops/consumo";
import type { Environment } from "@prisma-generated/client";

type Tenant = { organizationId: string };

export interface QuotaDoAmbiente {
  environmentId: string;
  limite: QuotaLimite;
  /** Uso considerado pela quota (réplicas máximas do HPA, volumes e bancos). */
  uso: Consumo;
  disponivel: QuotaLimite;
}

/**
 * Quotas por ambiente: guarda os limites, aplica ResourceQuota + LimitRange no
 * namespace (reconciler) e recusa ANTES de criar/escalar o que não cabe.
 */
@Injectable()
export class QuotaService {
  constructor(
    private readonly finops: FinOpsRepository,
    private readonly environments: EnvironmentRepository,
    private readonly reconcilers: ReconcilerFactory,
    private readonly kube: KubeContextResolver,
  ) {}

  private async findAmbiente(environmentId: string): Promise<Environment> {
    const env = await this.environments.findById(environmentId);
    if (!env) throw HttpError.notFound("Ambiente não encontrado.");
    return env;
  }

  getByEnvironment(environmentId: string, tenant: Tenant): Promise<QuotaDoAmbiente> {
    return withTransaction(
      async () => {
        const [env, inventario] = await Promise.all([
          this.findAmbiente(environmentId),
          this.finops.findInventarioDoAmbiente(environmentId),
        ]);
        const limite = toLimiteDoAmbiente(env);
        const uso = buildUsoDoInventario(inventario);
        return { environmentId, limite, uso, disponivel: buildDisponivel(limite, uso) };
      },
      { tenant },
    );
  }

  /** Grava os limites e reconcilia o namespace. Falha no cluster não desfaz o que foi salvo. */
  async setQuota(
    environmentId: string,
    limite: QuotaLimite,
    tenant: Tenant,
  ): Promise<QuotaDoAmbiente> {
    await withTransaction(() => this.environments.update(environmentId, toColunasDeQuota(limite)), {
      tenant,
    });
    await this.reconcile(environmentId, limite, tenant).catch((e) =>
      console.error("[quota] reconcile:", (e as Error).message),
    );
    return this.getByEnvironment(environmentId, tenant);
  }

  private async reconcile(
    environmentId: string,
    limite: QuotaLimite,
    tenant: Tenant,
  ): Promise<void> {
    const ctx = await this.kube.forEnvironment(environmentId, tenant);
    await this.reconcilers.forQuota().reconcile({ limite }, ctx);
  }

  /** Recusa com 422 e `errors[]` o pedido que estoura a quota do ambiente. */
  requireCabe(
    environmentId: string,
    pedido: Omit<PedidoDeQuota, "limite" | "inventario">,
    tenant: Tenant,
  ): Promise<void> {
    return withTransaction(
      async () => {
        const [env, inventario] = await Promise.all([
          this.findAmbiente(environmentId),
          this.finops.findInventarioDoAmbiente(environmentId),
        ]);
        requireCabeNaQuota({ ...pedido, limite: toLimiteDoAmbiente(env), inventario });
      },
      { tenant },
    );
  }

  /**
   * Troca de perfil, recursos ou réplicas de uma aplicação: o recurso novo no lugar
   * do atual. O atual tem de ser medido como o inventário o mede, senão o desconto erra.
   */
  requireCabeNaAplicacao(
    environmentId: string,
    troca: { atual: RecursoDaAplicacaoInput; novo: RecursoDaAplicacaoInput },
    path: string,
    tenant: Tenant,
  ): Promise<void> {
    const paths: Partial<Record<RecursoDeConsumo, string>> = {
      cpuMillicores: path,
      memoryMib: path,
      pods: path,
    };
    return this.requireCabe(
      environmentId,
      {
        pedido: [toRecursoDaAplicacao(troca.novo)],
        substitui: [toRecursoDaAplicacao(troca.atual)],
        paths,
      },
      tenant,
    );
  }
}
