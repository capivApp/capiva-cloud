/**
 * Escopo de reconcile adiado: vale só dentro do `withoutReconcile`, atravessa as
 * chamadas assíncronas e some ao sair. Puro, sem banco nem cluster.
 */
import { describe, expect, it } from "bun:test";
import { isReconcileDeferred, withoutReconcile } from "@functions/reconcileScope";

describe("withoutReconcile", () => {
  it("fora do escopo o reconcile não está adiado", () => {
    expect(isReconcileDeferred()).toBe(false);
  });

  it("dentro do escopo vale também depois de um await", async () => {
    const seen = await withoutReconcile(async () => {
      await Bun.sleep(0);
      return isReconcileDeferred();
    });
    expect(seen).toBe(true);
    expect(isReconcileDeferred()).toBe(false);
  });

  it("devolve o resultado e repassa o erro de quem roda dentro", async () => {
    expect(await withoutReconcile(async () => 42)).toBe(42);
    expect(withoutReconcile(async () => Promise.reject(new Error("x")))).rejects.toThrow("x");
  });
});
