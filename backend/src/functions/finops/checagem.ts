import { HttpError } from "@functions/HttpError";
import {
  subtractConsumo,
  type RecursoDeConsumo,
  type RecursoMedido,
} from "@functions/finops/consumo";
import {
  buildConsumoMaximo,
  buildUsoDoInventario,
  type Inventario,
} from "@functions/finops/inventario";
import {
  findViolacoesDeQuota,
  isQuotaDefinida,
  type QuotaLimite,
  type QuotaViolacao,
} from "@functions/finops/quota";

/** Colunas de quota do ambiente (schema Prisma). */
export interface ColunasDeQuota {
  quotaCpuMillicores: number | null;
  quotaMemoryMib: number | null;
  quotaPods: number | null;
  quotaStorageGi: number | null;
}

export const toLimiteDoAmbiente = (env: ColunasDeQuota): QuotaLimite => ({
  cpuMillicores: env.quotaCpuMillicores,
  memoryMib: env.quotaMemoryMib,
  pods: env.quotaPods,
  storageGi: env.quotaStorageGi,
});

export const toColunasDeQuota = (limite: QuotaLimite): ColunasDeQuota => ({
  quotaCpuMillicores: limite.cpuMillicores,
  quotaMemoryMib: limite.memoryMib,
  quotaPods: limite.pods,
  quotaStorageGi: limite.storageGi,
});

export interface PedidoDeQuota {
  limite: QuotaLimite;
  /** Tudo o que já existe no ambiente. */
  inventario: Inventario;
  /** O que o pedido passa a consumir. */
  pedido: RecursoMedido[];
  /** O que o pedido substitui (perfil ou réplicas anteriores da mesma aplicação). */
  substitui?: RecursoMedido[];
  /** Campo do formulário de cada recurso, para `errors[].path`. */
  paths?: Partial<Record<RecursoDeConsumo, string>>;
}

/** O que o pedido estoura na quota do ambiente; vazio quando cabe ou não há quota. */
export const findViolacoesDoPedido = ({
  limite,
  inventario,
  pedido,
  substitui = [],
  paths,
}: PedidoDeQuota): QuotaViolacao[] => {
  if (!isQuotaDefinida(limite)) return [];
  const uso = subtractConsumo(buildUsoDoInventario(inventario), buildConsumoMaximo(substitui));
  return findViolacoesDeQuota(limite, uso, buildConsumoMaximo(pedido), paths);
};

/** Recusa antecipada: o pod nunca chega a ficar Pending por falta de quota. */
export class QuotaExcedidaError extends HttpError {
  constructor(readonly violacoes: QuotaViolacao[]) {
    super(
      violacoes.map((v) => v.message).join(" "),
      422,
      "QUOTA_EXCEEDED",
      violacoes.map((v) => ({ path: v.path, message: v.message })),
    );
    this.name = "QuotaExcedidaError";
  }
}

export const requireCabeNaQuota = (pedido: PedidoDeQuota): void => {
  const violacoes = findViolacoesDoPedido(pedido);
  if (violacoes.length === 0) return;
  throw new QuotaExcedidaError(violacoes);
};
