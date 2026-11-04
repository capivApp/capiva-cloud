/**
 * FinOps: inventário do ambiente/organização vira uso (para quota) e relatório de
 * custo agregado por aplicação, banco, projeto e ambiente. Funções puras.
 */
import { describe, expect, it } from "bun:test";
import { buildUsoDoInventario, type Inventario } from "@functions/finops/inventario";
import { buildRelatorioDeCusto } from "@functions/finops/relatorio";

const precos = { currency: "BRL", vcpuHour: 0.1, ramGbHour: 0.01, diskGbMonth: 0.5 };

const inventario: Inventario = {
  aplicacoes: [
    {
      id: "app-1",
      name: "api",
      projectId: "p1",
      environmentId: "prod",
      profile: "LARGE",
      customResources: null,
      scaling: { minReplicas: 1, maxReplicas: 3 },
      volumes: [{ id: "v1", name: "data", sizeGi: 4 }],
    },
    { id: "app-2", name: "web", projectId: "p2", environmentId: "dev", profile: "NANO", customResources: null, scaling: null, volumes: [] },
  ],
  bancos: [{ id: "db-1", name: "pg", projectId: "p1", environmentId: "prod", kind: "POSTGRESQL", size: "SMALL", highAvailability: true }],
};

describe("buildUsoDoInventario", () => {
  it("soma o máximo de cada recurso (réplicas máximas do HPA, volumes e bancos)", () => {
    const soProd = { ...inventario, aplicacoes: [inventario.aplicacoes[0]!] };
    // api LARGE x3 = 3000m / 6144Mi / 3 pods ; volume 4Gi ; pg SMALL HA = 1500m / 3072Mi / 3 pods / 30Gi
    expect(buildUsoDoInventario(soProd)).toEqual({ cpuMillicores: 4500, memoryMib: 9216, pods: 6, storageGi: 34 });
  });
});

describe("buildRelatorioDeCusto", () => {
  const relatorio = buildRelatorioDeCusto(inventario, precos, {
    projetos: [
      { id: "p1", name: "Loja" },
      { id: "p2", name: "Site" },
    ],
    ambientes: [
      { id: "prod", name: "Produção" },
      { id: "dev", name: "Dev" },
    ],
  });

  it("custo da aplicação inclui os volumes dela", () => {
    // api: LARGE 87.6 por réplica (1 a 3) + volume 4 GiB = 2
    expect(relatorio.aplicacoes[0]).toMatchObject({ id: "app-1", custo: { min: 89.6, max: 264.8 } });
    // web: NANO x2 (sem HPA) = 0.2 vCPU = 14.6 ; 0.25 GB = 1.825 -> 16.43 (arredondado)
    expect(relatorio.aplicacoes[1]!.custo).toEqual({ min: 16.43, max: 16.43 });
  });

  it("banco gerenciado entra com tamanho x instâncias", () => {
    expect(relatorio.bancos[0]).toMatchObject({ id: "db-1", custo: { min: 146.4, max: 146.4 } });
  });

  it("agrega por projeto, ambiente e no total da organização", () => {
    expect(relatorio.projetos).toEqual([
      { id: "p1", name: "Loja", custo: { min: 236, max: 411.2 } },
      { id: "p2", name: "Site", custo: { min: 16.43, max: 16.43 } },
    ]);
    expect(relatorio.ambientes.map((a) => a.custo)).toEqual([
      { min: 236, max: 411.2 },
      { min: 16.43, max: 16.43 },
    ]);
    expect(relatorio.total).toEqual({ min: 252.43, max: 427.63 });
    expect(relatorio.currency).toBe("BRL");
  });
});
