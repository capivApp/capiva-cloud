/**
 * ApplicationService.reconcile dentro do `withoutReconcile` (capiva.json no deploy):
 * não toca no cluster nem no banco. Dependências vazias: qualquer acesso quebraria.
 */
import { describe, expect, it } from "bun:test";
import { ApplicationService } from "@service/ApplicationService";
import { withoutReconcile } from "@functions/reconcileScope";
import type { Application } from "@prisma-generated/client";

const app = { id: "app1", environmentId: "env1", sourceConfig: {} } as unknown as Application;
const untouched = new Proxy({}, { get: () => { throw new Error("dependência acessada"); } });
const service = new ApplicationService(...(Array.from({ length: 13 }, () => untouched) as ConstructorParameters<typeof ApplicationService>));

describe("ApplicationService.reconcile adiado", () => {
  it("no escopo do capiva.json não aplica nada", async () => {
    const status = await withoutReconcile(() => service.reconcile(app, { organizationId: "org1" }));
    expect(status.ready).toBe(false);
  });

  it("fora do escopo segue reconciliando", async () => {
    expect(service.reconcile(app, { organizationId: "org1" })).rejects.toThrow("dependência acessada");
  });
});
