/** Escala de severidade do Trivy (a mesma do relatório `--format json`). */
export const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN"] as const;
export type Severity = (typeof SEVERITIES)[number];

export type SeverityCounts = Record<Severity, number>;

/** Uma vulnerabilidade resumida (o que a tela mostra na lista de CVEs). */
export interface ScanVulnerability {
  id: string;
  pkgName: string;
  installedVersion: string;
  /** `null` quando o fornecedor ainda não publicou correção. */
  fixedVersion: string | null;
  severity: Severity;
  title?: string;
  url?: string;
  target?: string;
}

/** O que sai do relatório do Trivy: contagem por severidade + as principais CVEs. */
export interface TrivyFindings {
  counts: SeverityCounts;
  total: number;
  topVulnerabilities: ScanVulnerability[];
}

/** Nível a partir do qual o deploy é bloqueado. */
export const BlockOnSeverity = { NONE: "none", CRITICAL: "critical", HIGH: "high" } as const;
export type BlockOnSeverity = (typeof BlockOnSeverity)[keyof typeof BlockOnSeverity];

/** Política de scan da aplicação (`sourceConfig.security`). */
export interface ScanPolicy {
  scanEnabled: boolean;
  blockOnSeverity: BlockOnSeverity;
}

/**
 * Resultado do scan de um deploy. PASSED e BLOCKED vêm de um relatório lido;
 * ERROR é falha do PRÓPRIO scanner (timeout, registry inacessível) e nunca bloqueia.
 */
export const ScanStatus = { PASSED: "PASSED", BLOCKED: "BLOCKED", ERROR: "ERROR" } as const;
export type ScanStatus = (typeof ScanStatus)[keyof typeof ScanStatus];

/** Resumo persistido em `Deployment.scanSummary`. */
export interface ScanSummary extends TrivyFindings {
  status: ScanStatus;
  scanner: "trivy";
  scannerImage: string;
  imageRef: string;
  scannedAt: string;
  blockOnSeverity: BlockOnSeverity;
  /** Texto para o usuário (timeline e tela). */
  message: string;
  /** Motivo técnico quando o scanner falhou (log/diagnóstico). */
  error?: string;
}
