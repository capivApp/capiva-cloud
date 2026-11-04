/**
 * FinOps: checagem de quota (o que excede e quanto sobra) e cálculo do disponível.
 * Funções puras, sem banco nem cluster.
 */
import { describe, expect, it } from "bun:test";
import { QUOTA_ILIMITADA, buildDisponivel, findViolacoesDeQuota, isQuotaDefinida } from "@functions/finops/quota";

const limite = { cpuMillicores: 2000, memoryMib: 4096, pods: 6, storageGi: 50 };
const uso = { cpuMillicores: 1500, memoryMib: 3072, pods: 4, storageGi: 40 };

describe("isQuotaDefinida", () => {
  it("quota sem nenhum limite não vale", () => {
    expect(isQuotaDefinida(QUOTA_ILIMITADA)).toBe(false);
    expect(isQuotaDefinida({ ...QUOTA_ILIMITADA, pods: 10 })).toBe(true);
  });
});

describe("buildDisponivel", () => {
  it("limite menos o uso; null quando ilimitado", () => {
    expect(buildDisponivel(limite, uso)).toEqual({ cpuMillicores: 500, memoryMib: 1024, pods: 2, storageGi: 10 });
    expect(buildDisponivel({ ...limite, pods: null }, uso).pods).toBeNull();
  });

  it("uso acima do limite resulta em zero disponível", () => {
    expect(buildDisponivel(limite, { ...uso, pods: 9 }).pods).toBe(0);
  });
});

describe("findViolacoesDeQuota", () => {
  it("sem violação quando cabe", () => {
    const pedido = { cpuMillicores: 500, memoryMib: 1024, pods: 2, storageGi: 10 };
    expect(findViolacoesDeQuota(limite, uso, pedido)).toEqual([]);
  });

  it("ignora recurso sem limite", () => {
    const pedido = { cpuMillicores: 0, memoryMib: 0, pods: 100, storageGi: 0 };
    expect(findViolacoesDeQuota({ ...limite, pods: null }, uso, pedido)).toEqual([]);
  });

  it("diz o que excede, quanto foi pedido e quanto sobra", () => {
    const pedido = { cpuMillicores: 1000, memoryMib: 2048, pods: 1, storageGi: 0 };
    const violacoes = findViolacoesDeQuota(limite, uso, pedido);
    expect(violacoes.map((v) => v.recurso)).toEqual(["cpuMillicores", "memoryMib"]);
    expect(violacoes[0]).toMatchObject({ path: "cpuMillicores", solicitado: 1000, disponivel: 500 });
    expect(violacoes[0]!.message).toBe("CPU acima da quota do ambiente. Pedido: 1 vCPU. Disponível: 0,5 vCPU.");
    expect(violacoes[1]!.message).toBe("Memória acima da quota do ambiente. Pedido: 2 GiB. Disponível: 1 GiB.");
  });

  it("usa o path do formulário quando informado", () => {
    const pedido = { cpuMillicores: 0, memoryMib: 0, pods: 5, storageGi: 20 };
    const violacoes = findViolacoesDeQuota(limite, uso, pedido, { pods: "maxReplicas", storageGi: "sizeGi" });
    expect(violacoes.map((v) => v.path)).toEqual(["maxReplicas", "sizeGi"]);
    expect(violacoes[0]!.message).toBe("Pods acima da quota do ambiente. Pedido: 5 pods. Disponível: 2 pods.");
    expect(violacoes[1]!.message).toBe("Armazenamento acima da quota do ambiente. Pedido: 20 GiB. Disponível: 10 GiB.");
  });

  it("formata memória abaixo de 1 GiB em MiB", () => {
    const pedido = { cpuMillicores: 0, memoryMib: 1536, pods: 0, storageGi: 0 };
    const [violacao] = findViolacoesDeQuota(limite, { ...uso, memoryMib: 3584 }, pedido);
    expect(violacao!.message).toBe("Memória acima da quota do ambiente. Pedido: 1,5 GiB. Disponível: 512 MiB.");
  });
});
