/**
 * Leitura do status do Argo Rollout: reconhece o rollback automático (abort da
 * análise) para disparar `deploy.rollback`. Função pura sobre o `status` cru.
 */
import { describe, expect, it } from "bun:test";
import { isRolloutAborted } from "@functions/rolloutStatus";

describe("isRolloutAborted", () => {
  it("abort explícito no status é rollback do Argo", () => {
    expect(isRolloutAborted({ abort: true, phase: "Degraded" })).toBe(true);
  });

  it("fase Degraded por RolloutAborted também conta", () => {
    expect(isRolloutAborted({ phase: "Degraded", message: "RolloutAborted: metric failed" })).toBe(
      true,
    );
  });

  it("rollout saudável ou em progresso não é rollback", () => {
    expect(isRolloutAborted({ phase: "Healthy" })).toBe(false);
    expect(isRolloutAborted({ phase: "Progressing" })).toBe(false);
    expect(isRolloutAborted({ phase: "Degraded", message: "ProgressDeadlineExceeded" })).toBe(
      false,
    );
  });

  it("sem status não é rollback", () => {
    expect(isRolloutAborted(undefined)).toBe(false);
  });
});
