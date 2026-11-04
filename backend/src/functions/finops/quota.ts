import {
  RECURSOS_DE_CONSUMO,
  type Consumo,
  type RecursoDeConsumo,
} from "@functions/finops/consumo";

/** Limite por recurso; `null` = sem limite. Mesma unidade do `Consumo`. */
export type QuotaLimite = { [K in RecursoDeConsumo]: number | null };

export const QUOTA_ILIMITADA: QuotaLimite = {
  cpuMillicores: null,
  memoryMib: null,
  pods: null,
  storageGi: null,
};

export interface QuotaViolacao {
  recurso: RecursoDeConsumo;
  /** Campo do formulário que recebe a mensagem (`errors[].path`). */
  path: string;
  message: string;
  solicitado: number;
  disponivel: number;
}

export const isQuotaDefinida = (limite: QuotaLimite): boolean =>
  RECURSOS_DE_CONSUMO.some((recurso) => limite[recurso] !== null);

export const buildDisponivel = (limite: QuotaLimite, uso: Consumo): QuotaLimite => {
  const disponivelDe = (recurso: RecursoDeConsumo): number | null => {
    const max = limite[recurso];
    return max === null ? null : Math.max(0, max - uso[recurso]);
  };
  return {
    cpuMillicores: disponivelDe("cpuMillicores"),
    memoryMib: disponivelDe("memoryMib"),
    pods: disponivelDe("pods"),
    storageGi: disponivelDe("storageGi"),
  };
};

const formatDecimal = (valor: number): string =>
  valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

const formatMemoria = (mib: number): string =>
  mib < 1024 ? `${formatDecimal(mib)} MiB` : `${formatDecimal(mib / 1024)} GiB`;

/** Rótulo e formatação de cada recurso na mensagem para o usuário. */
const APRESENTACAO: Record<
  RecursoDeConsumo,
  { rotulo: string; format: (valor: number) => string }
> = {
  cpuMillicores: { rotulo: "CPU", format: (m) => `${formatDecimal(m / 1000)} vCPU` },
  memoryMib: { rotulo: "Memória", format: formatMemoria },
  pods: { rotulo: "Pods", format: (n) => `${formatDecimal(n)} ${n === 1 ? "pod" : "pods"}` },
  storageGi: { rotulo: "Armazenamento", format: (gi) => `${formatDecimal(gi)} GiB` },
};

export const formatConsumo = (recurso: RecursoDeConsumo, valor: number): string =>
  APRESENTACAO[recurso].format(valor);

const buildMensagem = (
  recurso: RecursoDeConsumo,
  solicitado: number,
  disponivel: number,
): string => {
  const { rotulo, format } = APRESENTACAO[recurso];
  return `${rotulo} acima da quota do ambiente. Pedido: ${format(solicitado)}. Disponível: ${format(disponivel)}.`;
};

/**
 * O que o pedido estoura na quota, com quanto foi pedido e quanto sobra. Lista
 * vazia = cabe. `paths` aponta cada recurso para o campo do formulário.
 */
export const findViolacoesDeQuota = (
  limite: QuotaLimite,
  uso: Consumo,
  pedido: Consumo,
  paths: Partial<Record<RecursoDeConsumo, string>> = {},
): QuotaViolacao[] => {
  const disponivel = buildDisponivel(limite, uso);
  return RECURSOS_DE_CONSUMO.flatMap((recurso) => {
    const sobra = disponivel[recurso];
    if (sobra === null || pedido[recurso] <= sobra) return [];
    return [
      {
        recurso,
        path: paths[recurso] ?? recurso,
        message: buildMensagem(recurso, pedido[recurso], sobra),
        solicitado: pedido[recurso],
        disponivel: sobra,
      },
    ];
  });
};
