import { useState } from "react";
import { Drawer } from "@/components/ui/drawer";
import { ScanDetails } from "@/pages/applications/components/scan/ScanDetails";
import { VulnerabilityBadge } from "@/pages/applications/components/scan/VulnerabilityBadge";
import type { ScanSummary } from "@/pages/applications/components/scan/types";

/**
 * Selo clicável do deploy: abre o detalhe do scan com as principais CVEs.
 * `defaultOpen` abre o detalhe já na montagem (link do status de commit para este deploy).
 */
export function DeploymentScanBadge({
  summary,
  version,
  defaultOpen = false,
}: {
  summary: ScanSummary | null | undefined;
  version: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (!summary) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <VulnerabilityBadge summary={summary} className="cursor-pointer" />
      </button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Vulnerabilidades da imagem"
        description={`Deploy ${version}`}
        width="max-w-lg"
      >
        <ScanDetails summary={summary} />
      </Drawer>
    </>
  );
}
