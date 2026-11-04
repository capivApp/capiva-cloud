import { TRIVY_IMAGE } from "@infra/security/trivyJob";
import { createBlockStrategy } from "@service/scan/scanPolicy.strategy";
import { ScanStatus, type ScanPolicy, type ScanSummary, type Severity, type SeverityCounts, type TrivyFindings } from "@interface/scan";

const ROTULO_SEVERIDADE: Record<Severity, { singular: string; plural: string }> = {
  CRITICAL: { singular: "crítica", plural: "críticas" },
  HIGH: { singular: "alta", plural: "altas" },
  MEDIUM: { singular: "média", plural: "médias" },
  LOW: { singular: "baixa", plural: "baixas" },
  UNKNOWN: { singular: "sem classificação", plural: "sem classificação" },
};

const pluralize = (n: number, rotulo: { singular: string; plural: string }): string => `${n} ${n === 1 ? rotulo.singular : rotulo.plural}`;

/** "2 críticas, 4 altas, 1 baixa" (só as severidades presentes). */
const formatCounts = (counts: SeverityCounts): string =>
  (Object.keys(ROTULO_SEVERIDADE) as Severity[])
    .filter((s) => counts[s] > 0)
    .map((s) => pluralize(counts[s], ROTULO_SEVERIDADE[s]))
    .join(", ");

const passedMessage = (findings: TrivyFindings): string =>
  findings.total === 0 ? "Scan concluído: nenhuma vulnerabilidade encontrada." : `Scan concluído: ${formatCounts(findings.counts)}.`;

const blockedMessage = (count: number, rotulo: { singular: string; plural: string }): string =>
  `Deploy bloqueado: a imagem tem ${count} ${count === 1 ? `vulnerabilidade ${rotulo.singular}` : `vulnerabilidades ${rotulo.plural}`}. Corrija a imagem ou ajuste a política em Configurações.`;

interface SummaryInput {
  imageRef: string;
  scannedAt: Date;
  policy: ScanPolicy;
}

const scannerImage = (): string => process.env.CAPIVA_TRIVY_IMAGE || TRIVY_IMAGE;

/** Resumo de um scan concluído: aplica a política e escreve a mensagem da timeline. */
export function buildScanSummary(input: SummaryInput & { findings: TrivyFindings }): ScanSummary {
  const strategy = createBlockStrategy(input.policy.blockOnSeverity);
  const blocked = strategy.isBlocked(input.findings.counts);
  return {
    ...input.findings,
    status: blocked ? ScanStatus.BLOCKED : ScanStatus.PASSED,
    scanner: "trivy",
    scannerImage: scannerImage(),
    imageRef: input.imageRef,
    scannedAt: input.scannedAt.toISOString(),
    blockOnSeverity: input.policy.blockOnSeverity,
    message: blocked ? blockedMessage(strategy.blockingCount(input.findings.counts), strategy.rotulo) : passedMessage(input.findings),
  };
}

/** Resumo de um scan que NÃO terminou. Nunca bloqueia: o deploy segue e a tela avisa. */
export function buildScanErrorSummary(input: SummaryInput & { reason: string }): ScanSummary {
  return {
    counts: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0 },
    total: 0,
    topVulnerabilities: [],
    status: ScanStatus.ERROR,
    scanner: "trivy",
    scannerImage: scannerImage(),
    imageRef: input.imageRef,
    scannedAt: input.scannedAt.toISOString(),
    blockOnSeverity: input.policy.blockOnSeverity,
    message: "Scan de vulnerabilidades não concluído. O deploy seguiu sem a verificação.",
    error: input.reason,
  };
}
