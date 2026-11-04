/**
 * FinOps: consumo de recursos por tipo (aplicação, banco gerenciado, volume).
 * Funções puras, sem banco nem cluster.
 */
import { describe, expect, it } from "bun:test";
import {
  CONSUMO_ZERO,
  buildFaixaDeConsumo,
  resolveReplicasDaAplicacao,
  subtractConsumo,
  sumConsumo,
} from "@functions/finops/consumo";

describe("resolveReplicasDaAplicacao", () => {
  it("sem HPA usa as réplicas fixas do reconcile (2)", () => {
    expect(resolveReplicasDaAplicacao(null)).toEqual({ min: 2, max: 2 });
  });

  it("com HPA vai do mínimo ao máximo da política", () => {
    expect(resolveReplicasDaAplicacao({ minReplicas: 1, maxReplicas: 5 })).toEqual({
      min: 1,
      max: 5,
    });
  });
});

describe("buildFaixaDeConsumo", () => {
  it("aplicação: perfil x réplicas, mínimo e máximo do HPA", () => {
    const faixa = buildFaixaDeConsumo({
      tipo: "APPLICATION",
      profile: "SMALL",
      minReplicas: 1,
      maxReplicas: 4,
    });
    expect(faixa.min).toEqual({ cpuMillicores: 250, memoryMib: 512, pods: 1, storageGi: 0 });
    expect(faixa.max).toEqual({ cpuMillicores: 1000, memoryMib: 2048, pods: 4, storageGi: 0 });
  });

  it("aplicação CUSTOM usa os recursos informados", () => {
    const faixa = buildFaixaDeConsumo({
      tipo: "APPLICATION",
      profile: "CUSTOM",
      customResources: { cpu: "1500m", memory: "3Gi" },
      minReplicas: 2,
      maxReplicas: 2,
    });
    expect(faixa.max).toEqual({ cpuMillicores: 3000, memoryMib: 6144, pods: 2, storageGi: 0 });
  });

  it("perfil desconhecido cai no SMALL", () => {
    const faixa = buildFaixaDeConsumo({
      tipo: "APPLICATION",
      profile: "XPTO",
      minReplicas: 1,
      maxReplicas: 1,
    });
    expect(faixa.max.cpuMillicores).toBe(250);
  });

  it("banco sem HA: uma instância com o storage do tamanho", () => {
    const faixa = buildFaixaDeConsumo({
      tipo: "DATABASE",
      kind: "POSTGRESQL",
      size: "SMALL",
      highAvailability: false,
    });
    expect(faixa.min).toEqual(faixa.max);
    expect(faixa.max).toEqual({ cpuMillicores: 500, memoryMib: 1024, pods: 1, storageGi: 10 });
  });

  it("banco HA multiplica por 3 instâncias (MinIO por 4 servidores)", () => {
    const pg = buildFaixaDeConsumo({
      tipo: "DATABASE",
      kind: "POSTGRESQL",
      size: "EXTRA_SMALL",
      highAvailability: true,
    });
    expect(pg.max).toEqual({ cpuMillicores: 750, memoryMib: 768, pods: 3, storageGi: 6 });
    const minio = buildFaixaDeConsumo({
      tipo: "DATABASE",
      kind: "MINIO",
      size: "EXTRA_SMALL",
      highAvailability: true,
    });
    expect(minio.max.pods).toBe(4);
  });

  it("volume conta só armazenamento", () => {
    const faixa = buildFaixaDeConsumo({ tipo: "VOLUME", sizeGi: 20 });
    expect(faixa.max).toEqual({ ...CONSUMO_ZERO, storageGi: 20 });
  });
});

describe("sumConsumo / subtractConsumo", () => {
  const a = { cpuMillicores: 500, memoryMib: 1024, pods: 2, storageGi: 10 };
  const b = { cpuMillicores: 250, memoryMib: 512, pods: 1, storageGi: 5 };

  it("soma campo a campo (vazio = zero)", () => {
    expect(sumConsumo([])).toEqual(CONSUMO_ZERO);
    expect(sumConsumo([a, b])).toEqual({
      cpuMillicores: 750,
      memoryMib: 1536,
      pods: 3,
      storageGi: 15,
    });
  });

  it("subtrai sem ficar negativo", () => {
    expect(subtractConsumo(a, b)).toEqual({
      cpuMillicores: 250,
      memoryMib: 512,
      pods: 1,
      storageGi: 5,
    });
    expect(subtractConsumo(b, a)).toEqual(CONSUMO_ZERO);
  });
});
