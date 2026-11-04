import { z } from "zod";
import { SEVERITIES, type ScanVulnerability, type Severity, type SeverityCounts, type TrivyFindings } from "@interface/scan";

/**
 * Marcadores que o Job imprime em volta do JSON. O log do pod mistura stderr do
 * Trivy (download do banco, avisos) com o relatório: sem marcador, o parse quebra
 * no primeiro "INFO Need to update DB".
 */
export const TRIVY_REPORT_BEGIN = "<<<CAPIVA_TRIVY_REPORT";
export const TRIVY_REPORT_END = "CAPIVA_TRIVY_REPORT>>>";

/** Quantas CVEs o resumo guarda por padrão (o relatório inteiro não vai para o banco). */
export const DEFAULT_TOP_LIMIT = 10;

export class TrivyReportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Só os campos que o resumo usa; o resto do relatório é ignorado. */
const vulnerabilitySchema = z.object({
  VulnerabilityID: z.string(),
  PkgName: z.string(),
  InstalledVersion: z.string().default(""),
  FixedVersion: z.string().optional(),
  Severity: z.string().default("UNKNOWN"),
  Title: z.string().optional(),
  PrimaryURL: z.string().optional(),
});

const reportSchema = z.object({
  Results: z
    .array(z.object({ Target: z.string().default(""), Vulnerabilities: z.array(vulnerabilitySchema).nullish() }))
    .nullish(),
});

const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, UNKNOWN: 0 };

const toSeverity = (value: string): Severity => (SEVERITIES as readonly string[]).includes(value) ? (value as Severity) : "UNKNOWN";

const emptyCounts = (): SeverityCounts => ({ CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0 });

/** Severidade maior primeiro; empate pelo id em ordem numérica (CVE-2024-4741 antes de CVE-2024-21538). */
const bySeverityThenId = (a: ScanVulnerability, b: ScanVulnerability): number =>
  SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
  a.id.localeCompare(b.id, "en", { numeric: true }) ||
  a.pkgName.localeCompare(b.pkgName);

const readJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    throw new TrivyReportError("Relatório do Trivy não é um JSON válido.");
  }
};

const readVulnerabilities = (raw: string): ScanVulnerability[] => {
  const parsed = reportSchema.safeParse(readJson(raw));
  if (!parsed.success) throw new TrivyReportError("Relatório do Trivy fora do formato esperado.");
  return (parsed.data.Results ?? []).flatMap((result) =>
    (result.Vulnerabilities ?? []).map((v) => ({
      id: v.VulnerabilityID,
      pkgName: v.PkgName,
      installedVersion: v.InstalledVersion,
      fixedVersion: v.FixedVersion || null,
      severity: toSeverity(v.Severity),
      title: v.Title,
      url: v.PrimaryURL,
      target: result.Target,
    })),
  );
};

/** A mesma CVE no mesmo pacote e versão (ex.: dois package-lock iguais) é UMA vulnerabilidade. */
const dedupe = (vulns: ScanVulnerability[]): ScanVulnerability[] => [
  ...new Map(vulns.map((v) => [`${v.id}|${v.pkgName}|${v.installedVersion}`, v])).values(),
];

const countBySeverity = (vulns: ScanVulnerability[]): SeverityCounts =>
  vulns.reduce((counts, v) => ({ ...counts, [v.severity]: counts[v.severity] + 1 }), emptyCounts());

/** Lê o JSON de `trivy image --format json` e resume por severidade + as `limit` principais CVEs. */
export function parseTrivyReport(raw: string, limit = DEFAULT_TOP_LIMIT): TrivyFindings {
  const vulns = dedupe(readVulnerabilities(raw)).sort(bySeverityThenId);
  return { counts: countBySeverity(vulns), total: vulns.length, topVulnerabilities: vulns.slice(0, limit) };
}

/** Recorta o relatório de dentro do log do pod. `null` se o Job não chegou a imprimi-lo inteiro. */
export function extractTrivyReport(logs: string): string | null {
  const start = logs.indexOf(TRIVY_REPORT_BEGIN);
  const end = logs.indexOf(TRIVY_REPORT_END, start + 1);
  if (start < 0 || end < 0) return null;
  return logs.slice(start + TRIVY_REPORT_BEGIN.length, end).trim();
}
