import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SEVERITIES, SEVERITY_LABEL, type ScanSummary, type ScanVulnerability, type Severity } from "@/pages/applications/components/scan/types";

const SEVERITY_VARIANT: Record<Severity, "danger" | "warning" | "default" | "muted"> = {
  CRITICAL: "danger",
  HIGH: "warning",
  MEDIUM: "default",
  LOW: "muted",
  UNKNOWN: "muted",
};

function SeverityCounts({ summary }: { summary: ScanSummary }) {
  return (
    <div className="grid grid-cols-5 gap-2">
      {SEVERITIES.map((s) => (
        <div key={s} className="rounded-lg border border-border px-2 py-2 text-center">
          <p className="text-lg font-bold">{summary.counts[s]}</p>
          <p className="text-[11px] capitalize text-muted-foreground">{SEVERITY_LABEL[s].plural}</p>
        </div>
      ))}
    </div>
  );
}

function VulnerabilityRow({ vuln }: { vuln: ScanVulnerability }) {
  return (
    <div className="space-y-1 rounded-lg border border-border px-3 py-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <a href={vuln.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono font-medium hover:underline">
          {vuln.id} {vuln.url && <ExternalLink className="size-3" />}
        </a>
        <Badge variant={SEVERITY_VARIANT[vuln.severity]} className="capitalize">{SEVERITY_LABEL[vuln.severity].singular}</Badge>
      </div>
      {vuln.title && <p className="text-muted-foreground">{vuln.title}</p>}
      <p className="font-mono">
        {vuln.pkgName} {vuln.installedVersion}
        <span className="text-muted-foreground"> → </span>
        {vuln.fixedVersion ?? <span className="text-muted-foreground">sem correção publicada</span>}
      </p>
    </div>
  );
}

/** Detalhe do scan de um deploy: contagem por severidade e as principais CVEs. */
export function ScanDetails({ summary }: { summary: ScanSummary }) {
  return (
    <div className="space-y-4">
      <p className="text-sm">{summary.message}</p>
      <div className="space-y-0.5 text-xs text-muted-foreground">
        <p className="break-all font-mono">{summary.imageRef}</p>
        <p>Escaneado em {new Date(summary.scannedAt).toLocaleString("pt-BR")}</p>
      </div>

      {summary.status !== "ERROR" && <SeverityCounts summary={summary} />}

      {summary.topVulnerabilities.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Principais vulnerabilidades</p>
          {summary.topVulnerabilities.map((v) => <VulnerabilityRow key={`${v.id}-${v.pkgName}-${v.installedVersion}`} vuln={v} />)}
          {summary.total > summary.topVulnerabilities.length && (
            <p className="text-xs text-muted-foreground">Mostrando {summary.topVulnerabilities.length} de {summary.total}.</p>
          )}
        </div>
      )}
    </div>
  );
}
