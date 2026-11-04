/**
 * Política de scan por aplicação (`sourceConfig.security`): leitura com defaults,
 * strategies de bloqueio por severidade e o resumo persistido no deploy. Puro.
 */
import { describe, expect, it } from "bun:test";
import { createBlockStrategy, readScanPolicy } from "@service/scan/scanPolicy.strategy";
import { buildScanErrorSummary, buildScanSummary } from "@service/scan/scanSummary";
import { scanPolicySchema } from "@schemas/scan.schema";
import type { SeverityCounts, TrivyFindings } from "@interface/scan";

const counts = (partial: Partial<SeverityCounts>): SeverityCounts => ({
  CRITICAL: 0,
  HIGH: 0,
  MEDIUM: 0,
  LOW: 0,
  UNKNOWN: 0,
  ...partial,
});

const findings = (partial: Partial<SeverityCounts>): TrivyFindings => {
  const c = counts(partial);
  return { counts: c, total: Object.values(c).reduce((s, n) => s + n, 0), topVulnerabilities: [] };
};

describe("readScanPolicy", () => {
  it("sem configuração: scan ligado e sem bloqueio", () => {
    expect(readScanPolicy(undefined)).toEqual({ scanEnabled: true, blockOnSeverity: "none" });
    expect(readScanPolicy({ image: "nginx" })).toEqual({
      scanEnabled: true,
      blockOnSeverity: "none",
    });
  });

  it("lê a política gravada em sourceConfig.security", () => {
    expect(readScanPolicy({ security: { scanEnabled: false, blockOnSeverity: "high" } })).toEqual({
      scanEnabled: false,
      blockOnSeverity: "high",
    });
  });

  it("valor inválido gravado cai no default do próprio campo", () => {
    expect(readScanPolicy({ security: { scanEnabled: false, blockOnSeverity: "medium" } })).toEqual(
      { scanEnabled: false, blockOnSeverity: "none" },
    );
    expect(readScanPolicy({ security: "ligado" })).toEqual({
      scanEnabled: true,
      blockOnSeverity: "none",
    });
  });
});

describe("createBlockStrategy", () => {
  it("none nunca bloqueia", () => {
    expect(createBlockStrategy("none").isBlocked(counts({ CRITICAL: 9, HIGH: 9 }))).toBe(false);
  });

  it("critical bloqueia só com vulnerabilidade crítica", () => {
    const strategy = createBlockStrategy("critical");
    expect(strategy.isBlocked(counts({ CRITICAL: 1 }))).toBe(true);
    expect(strategy.isBlocked(counts({ HIGH: 5, MEDIUM: 2 }))).toBe(false);
  });

  it("high bloqueia com crítica ou alta", () => {
    const strategy = createBlockStrategy("high");
    expect(strategy.isBlocked(counts({ HIGH: 1 }))).toBe(true);
    expect(strategy.isBlocked(counts({ CRITICAL: 1 }))).toBe(true);
    expect(strategy.isBlocked(counts({ MEDIUM: 3, LOW: 7 }))).toBe(false);
  });
});

describe("buildScanSummary", () => {
  const base = {
    imageRef: "registry.local/api:1.0.0",
    scannedAt: new Date("2026-11-04T14:00:00Z"),
  };

  it("aprovado: guarda contagens, política e mensagem com o resumo", () => {
    const summary = buildScanSummary({
      ...base,
      findings: findings({ CRITICAL: 2, HIGH: 4, MEDIUM: 3, LOW: 1 }),
      policy: { scanEnabled: true, blockOnSeverity: "none" },
    });
    expect(summary.status).toBe("PASSED");
    expect(summary.counts).toEqual(counts({ CRITICAL: 2, HIGH: 4, MEDIUM: 3, LOW: 1 }));
    expect(summary.total).toBe(10);
    expect(summary.blockOnSeverity).toBe("none");
    expect(summary.scanner).toBe("trivy");
    expect(summary.imageRef).toBe(base.imageRef);
    expect(summary.scannedAt).toBe("2026-11-04T14:00:00.000Z");
    expect(summary.message).toBe("Scan concluído: 2 críticas, 4 altas, 3 médias, 1 baixa.");
  });

  it("imagem limpa diz que não encontrou nada", () => {
    const summary = buildScanSummary({
      ...base,
      findings: findings({}),
      policy: { scanEnabled: true, blockOnSeverity: "high" },
    });
    expect(summary.status).toBe("PASSED");
    expect(summary.message).toBe("Scan concluído: nenhuma vulnerabilidade encontrada.");
  });

  it("bloqueado por crítica: mensagem diz o que aconteceu e o que fazer", () => {
    const summary = buildScanSummary({
      ...base,
      findings: findings({ CRITICAL: 2, HIGH: 4 }),
      policy: { scanEnabled: true, blockOnSeverity: "critical" },
    });
    expect(summary.status).toBe("BLOCKED");
    expect(summary.message).toBe(
      "Deploy bloqueado: a imagem tem 2 vulnerabilidades críticas. Corrija a imagem ou ajuste a política em Configurações.",
    );
  });

  it("bloqueado por alta soma críticas e altas", () => {
    const summary = buildScanSummary({
      ...base,
      findings: findings({ CRITICAL: 1, HIGH: 4 }),
      policy: { scanEnabled: true, blockOnSeverity: "high" },
    });
    expect(summary.status).toBe("BLOCKED");
    expect(summary.message).toBe(
      "Deploy bloqueado: a imagem tem 5 vulnerabilidades críticas ou altas. Corrija a imagem ou ajuste a política em Configurações.",
    );
  });

  it("mensagens de tela não usam travessão", () => {
    const summary = buildScanSummary({
      ...base,
      findings: findings({ HIGH: 1 }),
      policy: { scanEnabled: true, blockOnSeverity: "high" },
    });
    expect(summary.message).not.toContain("—");
    expect(summary.message).toContain("1 vulnerabilidade crítica ou alta.");
  });
});

describe("buildScanErrorSummary", () => {
  it("falha do scanner nunca bloqueia: status ERROR, motivo técnico separado da mensagem", () => {
    const summary = buildScanErrorSummary({
      imageRef: "registry.local/api:1.0.0",
      scannedAt: new Date("2026-11-04T14:00:00Z"),
      policy: { scanEnabled: true, blockOnSeverity: "critical" },
      reason: "Job scan-abc expirou (timeout).",
    });
    expect(summary.status).toBe("ERROR");
    expect(summary.total).toBe(0);
    expect(summary.topVulnerabilities).toEqual([]);
    expect(summary.error).toBe("Job scan-abc expirou (timeout).");
    expect(summary.message).toBe(
      "Scan de vulnerabilidades não concluído. O deploy seguiu sem a verificação.",
    );
  });
});

describe("scanPolicySchema", () => {
  it("aceita a política completa", () => {
    expect(scanPolicySchema.parse({ scanEnabled: false, blockOnSeverity: "critical" })).toEqual({
      scanEnabled: false,
      blockOnSeverity: "critical",
    });
  });

  it("recusa severidade fora da lista com mensagem em português", () => {
    const parsed = scanPolicySchema.safeParse({ scanEnabled: true, blockOnSeverity: "medium" });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe(
      "Escolha entre não bloquear, bloquear críticas ou bloquear altas e críticas.",
    );
  });
});
