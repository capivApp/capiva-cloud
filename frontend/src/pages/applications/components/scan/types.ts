/** Espelho do resumo gravado pelo backend em `Deployment.scanSummary` (Trivy). */
export const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN"] as const;
export type Severity = (typeof SEVERITIES)[number];
export type SeverityCounts = Record<Severity, number>;

export interface ScanVulnerability {
  id: string;
  pkgName: string;
  installedVersion: string;
  fixedVersion: string | null;
  severity: Severity;
  title?: string;
  url?: string;
  target?: string;
}

export const ScanStatus = { PASSED: "PASSED", BLOCKED: "BLOCKED", ERROR: "ERROR" } as const;
export type ScanStatus = (typeof ScanStatus)[keyof typeof ScanStatus];

export const BlockOnSeverity = { NONE: "none", CRITICAL: "critical", HIGH: "high" } as const;
export type BlockOnSeverity = (typeof BlockOnSeverity)[keyof typeof BlockOnSeverity];

export interface ScanSummary {
  status: ScanStatus;
  counts: SeverityCounts;
  total: number;
  topVulnerabilities: ScanVulnerability[];
  imageRef: string;
  scannedAt: string;
  blockOnSeverity: BlockOnSeverity;
  message: string;
  error?: string;
}

export interface ScanPolicy {
  scanEnabled: boolean;
  blockOnSeverity: BlockOnSeverity;
}

export const SEVERITY_LABEL: Record<Severity, { singular: string; plural: string }> = {
  CRITICAL: { singular: "crítica", plural: "críticas" },
  HIGH: { singular: "alta", plural: "altas" },
  MEDIUM: { singular: "média", plural: "médias" },
  LOW: { singular: "baixa", plural: "baixas" },
  UNKNOWN: { singular: "sem classificação", plural: "sem classificação" },
};

export const pluralizeSeverity = (severity: Severity, n: number): string =>
  `${n} ${n === 1 ? SEVERITY_LABEL[severity].singular : SEVERITY_LABEL[severity].plural}`;

const isBlockOnSeverity = (value: unknown): value is BlockOnSeverity =>
  (Object.values(BlockOnSeverity) as unknown[]).includes(value);

/** Política gravada em `sourceConfig.security`, com os mesmos defaults do backend. */
export function readScanPolicy(sourceConfig: Record<string, unknown> | null | undefined): ScanPolicy {
  const security = (sourceConfig?.security ?? {}) as Partial<Record<keyof ScanPolicy, unknown>>;
  return {
    scanEnabled: typeof security.scanEnabled === "boolean" ? security.scanEnabled : true,
    blockOnSeverity: isBlockOnSeverity(security.blockOnSeverity) ? security.blockOnSeverity : BlockOnSeverity.NONE,
  };
}
