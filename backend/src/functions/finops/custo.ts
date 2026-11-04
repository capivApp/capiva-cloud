import { buildFaixaDeConsumo, type Consumo, type RecursoMedido } from "@functions/finops/consumo";

/** Tabela de preços da plataforma. Só visibilidade: não há cobrança. */
export interface TabelaDePrecos {
  currency: string;
  /** Preço por vCPU-hora. */
  vcpuHour: number;
  /** Preço por GB de RAM-hora. */
  ramGbHour: number;
  /** Preço por GB de disco-mês. */
  diskGbMonth: number;
}

export interface FaixaDeCusto {
  min: number;
  max: number;
}

/** Mês de referência para custo de computação (365 dias x 24 h / 12). */
export const HOURS_PER_MONTH = 730;

export const DEFAULT_TABELA_DE_PRECOS: TabelaDePrecos = {
  currency: "BRL",
  vcpuHour: 0.2,
  ramGbHour: 0.03,
  diskGbMonth: 0.5,
};

const readPreco = (raw: string | undefined, fallback: number): number => {
  const valor = Number(raw);
  if (raw === undefined || raw.trim() === "" || !Number.isFinite(valor) || valor < 0)
    return fallback;
  return valor;
};

export const readTabelaDePrecos = (
  env: Record<string, string | undefined> = process.env,
): TabelaDePrecos => ({
  currency: env.CAPIVA_PRICE_CURRENCY?.trim() || DEFAULT_TABELA_DE_PRECOS.currency,
  vcpuHour: readPreco(env.CAPIVA_PRICE_VCPU_HOUR, DEFAULT_TABELA_DE_PRECOS.vcpuHour),
  ramGbHour: readPreco(env.CAPIVA_PRICE_RAM_GB_HOUR, DEFAULT_TABELA_DE_PRECOS.ramGbHour),
  diskGbMonth: readPreco(env.CAPIVA_PRICE_DISK_GB_MONTH, DEFAULT_TABELA_DE_PRECOS.diskGbMonth),
});

const roundCentavos = (valor: number): number => Math.round(valor * 100) / 100;

export const calculateCustoMensal = (consumo: Consumo, precos: TabelaDePrecos): number => {
  const cpu = (consumo.cpuMillicores / 1000) * precos.vcpuHour * HOURS_PER_MONTH;
  const ram = (consumo.memoryMib / 1024) * precos.ramGbHour * HOURS_PER_MONTH;
  const disco = consumo.storageGi * precos.diskGbMonth;
  return roundCentavos(cpu + ram + disco);
};

/** Custo mensal estimado de um recurso: a strategy do tipo dá a faixa de consumo. */
export const estimateCustoDoRecurso = (
  recurso: RecursoMedido,
  precos: TabelaDePrecos,
): FaixaDeCusto => {
  const faixa = buildFaixaDeConsumo(recurso);
  return {
    min: calculateCustoMensal(faixa.min, precos),
    max: calculateCustoMensal(faixa.max, precos),
  };
};

export const sumFaixasDeCusto = (faixas: FaixaDeCusto[]): FaixaDeCusto => {
  const total = faixas.reduce((acc, f) => ({ min: acc.min + f.min, max: acc.max + f.max }), {
    min: 0,
    max: 0,
  });
  return { min: roundCentavos(total.min), max: roundCentavos(total.max) };
};
