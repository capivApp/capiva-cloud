/**
 * FinOps: checagem antecipada de quota de um pedido (criar, escalar, trocar
 * perfil), descontando o que o pedido substitui, e o erro 422 com `errors[]`.
 * Funções puras, sem banco nem cluster.
 */
import { describe, expect, it } from "bun:test";
import { QuotaExcedidaError, findViolacoesDoPedido, toLimiteDoAmbiente } from "@functions/finops/checagem";
import { QUOTA_ILIMITADA } from "@functions/finops/quota";
import type { Inventario } from "@functions/finops/inventario";

const inventario: Inventario = {
  aplicacoes: [
    { id: "a1", name: "api", projectId: "p", environmentId: "e", profile: "SMALL", customResources: null, scaling: null, volumes: [] },
  ],
  bancos: [],
};
// uso: SMALL x2 = 500m / 1024Mi / 2 pods
const limite = { cpuMillicores: 1000, memoryMib: 2048, pods: 4, storageGi: 10 };

describe("toLimiteDoAmbiente", () => {
  it("lê as colunas de quota do ambiente", () => {
    expect(toLimiteDoAmbiente({ quotaCpuMillicores: 1000, quotaMemoryMib: null, quotaPods: 3, quotaStorageGi: null })).toEqual({
      cpuMillicores: 1000,
      memoryMib: null,
      pods: 3,
      storageGi: null,
    });
  });
});

describe("findViolacoesDoPedido", () => {
  it("sem quota definida nunca recusa", () => {
    const pedido = [{ tipo: "APPLICATION" as const, profile: "XLARGE", minReplicas: 10, maxReplicas: 10 }];
    expect(findViolacoesDoPedido({ limite: QUOTA_ILIMITADA, inventario, pedido })).toEqual([]);
  });

  it("nova aplicação que cabe passa", () => {
    const pedido = [{ tipo: "APPLICATION" as const, profile: "SMALL", minReplicas: 2, maxReplicas: 2 }];
    expect(findViolacoesDoPedido({ limite, inventario, pedido })).toEqual([]);
  });

  it("considera as réplicas máximas do HPA", () => {
    const pedido = [{ tipo: "APPLICATION" as const, profile: "NANO", minReplicas: 1, maxReplicas: 3 }];
    const violacoes = findViolacoesDoPedido({ limite, inventario, pedido, paths: { pods: "maxReplicas" } });
    expect(violacoes.map((v) => v.path)).toEqual(["maxReplicas"]);
  });

  it("troca de perfil desconta o consumo antigo da própria aplicação", () => {
    const atual = [{ tipo: "APPLICATION" as const, profile: "SMALL", minReplicas: 2, maxReplicas: 2 }];
    const cabe = [{ tipo: "APPLICATION" as const, profile: "MEDIUM", minReplicas: 2, maxReplicas: 2 }];
    expect(findViolacoesDoPedido({ limite, inventario, pedido: cabe, substitui: atual })).toEqual([]);
    const naoCabe = [{ tipo: "APPLICATION" as const, profile: "LARGE", minReplicas: 2, maxReplicas: 2 }];
    expect(findViolacoesDoPedido({ limite, inventario, pedido: naoCabe, substitui: atual }).map((v) => v.recurso)).toEqual([
      "cpuMillicores",
      "memoryMib",
    ]);
  });
});

describe("QuotaExcedidaError", () => {
  it("é 422 com cada violação no campo do formulário", () => {
    const violacoes = findViolacoesDoPedido({
      limite,
      inventario,
      pedido: [{ tipo: "VOLUME", sizeGi: 20 }],
      paths: { storageGi: "sizeGi" },
    });
    const erro = new QuotaExcedidaError(violacoes);
    expect(erro.status).toBe(422);
    expect(erro.code).toBe("QUOTA_EXCEEDED");
    expect(erro.errors).toEqual([
      { path: "sizeGi", message: "Armazenamento acima da quota do ambiente. Pedido: 20 GiB. Disponível: 10 GiB." },
    ]);
    expect(erro.message).toBe("Armazenamento acima da quota do ambiente. Pedido: 20 GiB. Disponível: 10 GiB.");
  });
});
