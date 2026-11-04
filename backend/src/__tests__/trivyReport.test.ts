/**
 * Leitura do relatório do Trivy (`trivy image --format json`): extração do JSON
 * de dentro do log do pod e resumo por severidade + principais CVEs. Sem cluster.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import {
  TRIVY_REPORT_BEGIN,
  TRIVY_REPORT_END,
  TrivyReportError,
  extractTrivyReport,
  parseTrivyReport,
} from "@infra/security/trivyReport";

const FIXTURE = readFileSync(join(import.meta.dir, "fixtures", "trivy-image-report.json"), "utf8");

describe("parseTrivyReport", () => {
  it("conta as vulnerabilidades por severidade em todos os alvos", () => {
    const findings = parseTrivyReport(FIXTURE);
    expect(findings.counts).toEqual({ CRITICAL: 2, HIGH: 4, MEDIUM: 3, LOW: 1, UNKNOWN: 0 });
    expect(findings.total).toBe(10);
  });

  it("ordena as principais por severidade e id (numérico) e respeita o limite", () => {
    const findings = parseTrivyReport(FIXTURE, 5);
    expect(findings.topVulnerabilities.map((v) => `${v.id}:${v.pkgName}`)).toEqual([
      "CVE-2024-5535:libcrypto3",
      "CVE-2024-5535:libssl3",
      "CVE-2024-4741:libcrypto3",
      "CVE-2024-21538:cross-spawn",
      "CVE-2024-29415:ip",
    ]);
  });

  it("expõe pacote, versão instalada, versão corrigida, severidade e alvo", () => {
    const [first] = parseTrivyReport(FIXTURE, 1).topVulnerabilities;
    expect(first).toEqual({
      id: "CVE-2024-5535",
      pkgName: "libcrypto3",
      installedVersion: "3.1.4-r5",
      fixedVersion: "3.1.6-r0",
      severity: "CRITICAL",
      title: "openssl: SSL_select_next_proto buffer overread",
      url: "https://avd.aquasec.com/nvd/cve-2024-5535",
      target: "registry.local:5000/api:1.4.0 (alpine 3.19.1)",
    });
  });

  it("vulnerabilidade sem correção publicada vem com fixedVersion null", () => {
    const ip = parseTrivyReport(FIXTURE).topVulnerabilities.find((v) => v.pkgName === "ip");
    expect(ip?.fixedVersion).toBeNull();
  });

  it("alvo sem a chave Vulnerabilities (gobinary limpo) não quebra a leitura", () => {
    const clean = JSON.stringify({ SchemaVersion: 2, ArtifactName: "x", Results: [{ Target: "bin", Class: "lang-pkgs", Type: "gobinary" }] });
    expect(parseTrivyReport(clean)).toEqual({
      counts: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0 },
      total: 0,
      topVulnerabilities: [],
    });
  });

  it("imagem sem nenhum alvo (Results ausente) é relatório limpo", () => {
    expect(parseTrivyReport(JSON.stringify({ SchemaVersion: 2, ArtifactName: "scratch" })).total).toBe(0);
  });

  it("a mesma CVE no mesmo pacote e versão em dois alvos conta uma vez", () => {
    const vuln = { VulnerabilityID: "CVE-1", PkgName: "lodash", InstalledVersion: "4.17.20", Severity: "HIGH" };
    const report = JSON.stringify({ SchemaVersion: 2, Results: [{ Target: "a/package-lock.json", Vulnerabilities: [vuln] }, { Target: "b/package-lock.json", Vulnerabilities: [vuln] }] });
    expect(parseTrivyReport(report).counts.HIGH).toBe(1);
  });

  it("severidade fora da escala do Trivy cai em UNKNOWN", () => {
    const report = JSON.stringify({ SchemaVersion: 2, Results: [{ Target: "t", Vulnerabilities: [{ VulnerabilityID: "CVE-2", PkgName: "p", InstalledVersion: "1", Severity: "WHATEVER" }] }] });
    expect(parseTrivyReport(report).counts.UNKNOWN).toBe(1);
  });

  it("JSON inválido ou fora do formato vira TrivyReportError", () => {
    expect(() => parseTrivyReport("{ quebrado")).toThrow(TrivyReportError);
    expect(() => parseTrivyReport(JSON.stringify({ Results: "nao-e-lista" }))).toThrow(TrivyReportError);
  });
});

describe("extractTrivyReport", () => {
  it("recorta o JSON entre os marcadores, ignorando o resto do log", () => {
    const logs = ["2026-11-04T14:02:00Z INFO Downloading vulnerability DB...", TRIVY_REPORT_BEGIN, '{"SchemaVersion":2}', TRIVY_REPORT_END, ""].join("\n");
    expect(extractTrivyReport(logs)).toBe('{"SchemaVersion":2}');
  });

  it("devolve null quando o relatório não chegou ao log", () => {
    expect(extractTrivyReport("FATAL unable to initialize image scanner")).toBeNull();
    expect(extractTrivyReport(`${TRIVY_REPORT_BEGIN}\n{"SchemaVersion":2`)).toBeNull();
  });
});
