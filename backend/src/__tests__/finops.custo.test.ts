/**
 * FinOps: tabela de preços (variáveis de ambiente) e custo mensal estimado por
 * recurso e agregado. Funções puras, sem banco nem cluster.
 */
import { describe, expect, it } from "bun:test";
import {
  DEFAULT_TABELA_DE_PRECOS,
  calculateCustoMensal,
  estimateCustoDoRecurso,
  readTabelaDePrecos,
  sumFaixasDeCusto,
} from "@functions/finops/custo";

const precos = { currency: "BRL", vcpuHour: 0.1, ramGbHour: 0.01, diskGbMonth: 0.5 };

describe("readTabelaDePrecos", () => {
  it("usa os defaults quando nada foi configurado", () => {
    expect(readTabelaDePrecos({})).toEqual(DEFAULT_TABELA_DE_PRECOS);
    expect(DEFAULT_TABELA_DE_PRECOS.currency).toBe("BRL");
  });

  it("lê moeda e preços das variáveis de ambiente", () => {
    const tabela = readTabelaDePrecos({
      CAPIVA_PRICE_CURRENCY: "USD",
      CAPIVA_PRICE_VCPU_HOUR: "0.04",
      CAPIVA_PRICE_RAM_GB_HOUR: "0.005",
      CAPIVA_PRICE_DISK_GB_MONTH: "0.1",
    });
    expect(tabela).toEqual({ currency: "USD", vcpuHour: 0.04, ramGbHour: 0.005, diskGbMonth: 0.1 });
  });

  it("valor inválido ou negativo volta ao default", () => {
    const tabela = readTabelaDePrecos({
      CAPIVA_PRICE_VCPU_HOUR: "abc",
      CAPIVA_PRICE_RAM_GB_HOUR: "-1",
    });
    expect(tabela.vcpuHour).toBe(DEFAULT_TABELA_DE_PRECOS.vcpuHour);
    expect(tabela.ramGbHour).toBe(DEFAULT_TABELA_DE_PRECOS.ramGbHour);
  });
});

describe("calculateCustoMensal", () => {
  it("vCPU-hora e GB de RAM-hora x 730 h, disco por GB-mês", () => {
    const custo = calculateCustoMensal(
      { cpuMillicores: 1000, memoryMib: 2048, pods: 1, storageGi: 10 },
      precos,
    );
    // 1 vCPU * 0.1 * 730 = 73 ; 2 GB * 0.01 * 730 = 14.6 ; 10 GB * 0.5 = 5
    expect(custo).toBe(92.6);
  });
});

describe("estimateCustoDoRecurso", () => {
  it("aplicação: faixa entre o mínimo e o máximo do HPA", () => {
    const faixa = estimateCustoDoRecurso(
      { tipo: "APPLICATION", profile: "LARGE", minReplicas: 1, maxReplicas: 3 },
      precos,
    );
    expect(faixa).toEqual({ min: 87.6, max: 262.8 });
  });

  it("banco gerenciado: tamanho x instâncias HA, com o disco de cada instância", () => {
    const faixa = estimateCustoDoRecurso(
      { tipo: "DATABASE", kind: "POSTGRESQL", size: "SMALL", highAvailability: true },
      precos,
    );
    // por instância: 0.5 vCPU = 36.5 ; 1 GB = 7.3 ; 10 GB = 5  -> 48.8 x 3
    expect(faixa).toEqual({ min: 146.4, max: 146.4 });
  });

  it("volume: só o disco", () => {
    expect(estimateCustoDoRecurso({ tipo: "VOLUME", sizeGi: 4 }, precos)).toEqual({
      min: 2,
      max: 2,
    });
  });
});

describe("sumFaixasDeCusto", () => {
  it("soma mínimos e máximos com 2 casas", () => {
    expect(sumFaixasDeCusto([])).toEqual({ min: 0, max: 0 });
    expect(
      sumFaixasDeCusto([
        { min: 0.1, max: 1.2 },
        { min: 0.2, max: 2.1 },
      ]),
    ).toEqual({ min: 0.3, max: 3.3 });
  });
});
