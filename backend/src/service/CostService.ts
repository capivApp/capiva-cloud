import { Injectable } from "@di/index";
import { FinOpsRepository } from "@repository/FinOpsRepository";
import { withTransaction } from "@database/withTransaction";
import {
  estimateCustoDoRecurso,
  readTabelaDePrecos,
  type FaixaDeCusto,
  type TabelaDePrecos,
} from "@functions/finops/custo";
import { buildRelatorioDeCusto, type RelatorioDeCusto } from "@functions/finops/relatorio";
import { toRecursoDaAplicacao } from "@functions/finops/inventario";

export interface EstimativaDeAplicacao {
  currency: string;
  precos: TabelaDePrecos;
  custo: FaixaDeCusto;
}

/**
 * Custo mensal ESTIMADO (visibilidade, sem cobrança): tabela de preços das
 * variáveis de ambiente x consumo de cada recurso, agregado por projeto,
 * ambiente e organização.
 */
@Injectable()
export class CostService {
  constructor(private readonly finops: FinOpsRepository) {}

  forOrganization(tenant: { organizationId: string }): Promise<RelatorioDeCusto> {
    return withTransaction(
      async () => {
        const [inventario, nomes] = await Promise.all([
          this.finops.findInventarioDaOrganizacao(),
          this.finops.findNomesDaOrganizacao(),
        ]);
        return buildRelatorioDeCusto(inventario, readTabelaDePrecos(), nomes);
      },
      { tenant },
    );
  }

  /** Estimativa do wizard: perfil x réplicas, antes de a aplicação existir. */
  estimateAplicacao(input: {
    profile: string;
    minReplicas?: number;
    maxReplicas?: number;
  }): EstimativaDeAplicacao {
    const precos = readTabelaDePrecos();
    const scaling =
      input.minReplicas && input.maxReplicas
        ? { minReplicas: input.minReplicas, maxReplicas: input.maxReplicas }
        : null;
    const recurso = toRecursoDaAplicacao({
      profile: input.profile,
      customResources: null,
      scaling,
    });
    return { currency: precos.currency, precos, custo: estimateCustoDoRecurso(recurso, precos) };
  }
}
