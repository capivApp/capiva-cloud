/**
 * FinOps: as réplicas fixas gravadas em `sourceConfig.replicas` (tela ou capiva.json)
 * entram no consumo que a quota considera. Com HPA, valem o mínimo e o máximo da
 * política. Funções puras, sem banco nem cluster.
 */
import { describe, expect, it } from "bun:test";
import { resolveReplicasFixas } from "@functions/finops/consumo";
import { buildUsoDoInventario, toRecursoDaAplicacao, type Inventario } from "@functions/finops/inventario";

describe("resolveReplicasFixas", () => {
  it("usa as réplicas gravadas na configuração", () => {
    expect(resolveReplicasFixas({ sourceConfig: { replicas: 5 } })).toBe(5);
  });

  it("sem configuração, mantém o padrão de 2 réplicas", () => {
    expect(resolveReplicasFixas({ sourceConfig: {} })).toBe(2);
    expect(resolveReplicasFixas({})).toBe(2);
  });

  it("preview sem configuração roda com uma réplica", () => {
    expect(resolveReplicasFixas({ sourceConfig: null, previewOfId: "app-origem" })).toBe(1);
  });
});

describe("toRecursoDaAplicacao com réplicas fixas", () => {
  it("sem HPA, as réplicas gravadas viram mínimo e máximo", () => {
    const recurso = toRecursoDaAplicacao({ profile: "SMALL", customResources: null, scaling: null, sourceConfig: { replicas: 50 } });
    expect(recurso).toMatchObject({ minReplicas: 50, maxReplicas: 50 });
  });

  it("com HPA, a política continua mandando e as réplicas gravadas são ignoradas", () => {
    const recurso = toRecursoDaAplicacao({
      profile: "SMALL",
      customResources: null,
      scaling: { minReplicas: 1, maxReplicas: 4 },
      sourceConfig: { replicas: 50 },
    });
    expect(recurso).toMatchObject({ minReplicas: 1, maxReplicas: 4 });
  });
});

describe("buildUsoDoInventario", () => {
  it("conta as réplicas gravadas da aplicação sem HPA", () => {
    const inventario: Inventario = {
      aplicacoes: [
        {
          id: "a1",
          name: "api",
          projectId: "p",
          environmentId: "e",
          profile: "SMALL",
          customResources: null,
          scaling: null,
          sourceConfig: { replicas: 3 },
          previewOfId: null,
          volumes: [],
        },
      ],
      bancos: [],
    };
    expect(buildUsoDoInventario(inventario)).toEqual({ cpuMillicores: 750, memoryMib: 1536, pods: 3, storageGi: 0 });
  });
});
