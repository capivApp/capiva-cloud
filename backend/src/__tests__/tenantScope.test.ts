import { describe, expect, it } from "bun:test";
import { transactionStorage } from "@database/context";
import { tenantScope } from "@database/tenantScope";
import type { Prisma } from "@prisma-generated/client";

/** Roda `fn` dentro de um contexto transacional com (ou sem) organização. */
function inTenant<T>(organizationId: string | undefined, fn: () => T): T {
  const ctx = { tx: {} as Prisma.TransactionClient, tenant: { organizationId } };
  return transactionStorage.run(ctx, fn);
}

const ORG = "org_alpha";

describe("tenantScope", () => {
  it("modelo ligado direto à organização filtra por organizationId", () => {
    expect(inTenant(ORG, () => tenantScope("cluster"))).toEqual({ organizationId: ORG });
    expect(inTenant(ORG, () => tenantScope("environment"))).toEqual({ organizationId: ORG });
    expect(inTenant(ORG, () => tenantScope("project"))).toEqual({ organizationId: ORG });
  });

  it("aplicação chega à organização pelo projeto", () => {
    expect(inTenant(ORG, () => tenantScope("application"))).toEqual({
      project: { organizationId: ORG },
    });
  });

  it("recursos filhos da aplicação atravessam a cadeia completa", () => {
    const expected = { application: { project: { organizationId: ORG } } };
    for (const model of [
      "volume",
      "domain",
      "envVar",
      "deployment",
      "uptimeCheck",
      "scalingPolicy",
      "alertRule",
    ] as const) {
      expect(inTenant(ORG, () => tenantScope(model))).toEqual(expected);
    }
  });

  it("nó de cluster chega à organização pelo cluster", () => {
    expect(inTenant(ORG, () => tenantScope("clusterNode"))).toEqual({
      cluster: { organizationId: ORG },
    });
  });

  it("organização é filtrada pelo próprio id", () => {
    expect(inTenant(ORG, () => tenantScope("organization"))).toEqual({ id: ORG });
  });

  // Regressão: um escopo silenciosamente vazio devolveria recursos de TODAS as
  // organizações — o modo de falha exato que a correção existe para impedir.
  it("falha alto quando não há organização no contexto", () => {
    expect(() => inTenant(undefined, () => tenantScope("application"))).toThrow(
      /exige organização/,
    );
  });

  it("falha alto fora de uma transação", () => {
    expect(() => tenantScope("application")).toThrow(/transação ativa/);
  });
});
