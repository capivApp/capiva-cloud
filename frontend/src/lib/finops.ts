import { ApiError } from "@/lib/api";

/** Faixa de custo mensal estimado: mínimo e máximo do HPA. */
export interface FaixaDeCusto {
  min: number;
  max: number;
}

/** Consumo e limites na unidade da API: millicores, MiB, pods e GiB. */
export interface ConsumoDeRecursos {
  cpuMillicores: number;
  memoryMib: number;
  pods: number;
  storageGi: number;
}

export type RecursoDeQuota = keyof ConsumoDeRecursos;
export type LimiteDeQuota = { [K in RecursoDeQuota]: number | null };

export const formatMoeda = (valor: number, currency: string): string =>
  valor.toLocaleString("pt-BR", { style: "currency", currency, maximumFractionDigits: 2 });

/** "R$ 10,00/mês" ou "R$ 10,00 a R$ 30,00/mês" quando o HPA varia as réplicas. */
export const formatCustoMensal = (custo: FaixaDeCusto, currency: string): string => {
  if (custo.min === custo.max) return `${formatMoeda(custo.max, currency)}/mês`;
  return `${formatMoeda(custo.min, currency)} a ${formatMoeda(custo.max, currency)}/mês`;
};

const formatDecimal = (valor: number): string =>
  valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

/** Rótulo e conversão de cada recurso entre a unidade da API e a da tela. */
export const RECURSOS_DE_QUOTA: Record<
  RecursoDeQuota,
  { rotulo: string; unidade: string; fromApi: (v: number) => number; toApi: (v: number) => number }
> = {
  cpuMillicores: {
    rotulo: "CPU",
    unidade: "vCPU",
    fromApi: (m) => m / 1000,
    toApi: (v) => Math.round(v * 1000),
  },
  memoryMib: {
    rotulo: "Memória",
    unidade: "GiB",
    fromApi: (mib) => mib / 1024,
    toApi: (v) => Math.round(v * 1024),
  },
  pods: { rotulo: "Pods", unidade: "pods", fromApi: (n) => n, toApi: (v) => Math.round(v) },
  storageGi: {
    rotulo: "Armazenamento",
    unidade: "GiB",
    fromApi: (gi) => gi,
    toApi: (v) => Math.round(v),
  },
};

export const QUOTA_RECURSOS = Object.keys(RECURSOS_DE_QUOTA) as RecursoDeQuota[];

export const formatRecurso = (recurso: RecursoDeQuota, valorApi: number): string =>
  `${formatDecimal(RECURSOS_DE_QUOTA[recurso].fromApi(valorApi))} ${RECURSOS_DE_QUOTA[recurso].unidade}`;

/** Erros por campo devolvidos pela API (`errors: [{ path, message }]`). */
export const readCampoErrors = (error: unknown): { path: string; message: string }[] => {
  if (!(error instanceof ApiError)) return [];
  const errors = (error.body as { errors?: unknown } | undefined)?.errors;
  return Array.isArray(errors) ? (errors as { path: string; message: string }[]) : [];
};
