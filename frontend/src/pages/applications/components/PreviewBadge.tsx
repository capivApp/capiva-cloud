import { GitPullRequest } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Application } from "@/pages/applications/hooks/useApplications";

/** Marca de preview por PR (lista de aplicações e cabeçalho do detalhe). */
export function PreviewBadge({ app }: { app: Pick<Application, "previewOfId" | "previewPrNumber"> }) {
  if (!app.previewOfId) return null;
  return (
    <Badge variant="warning">
      <GitPullRequest className="size-3" /> Preview PR #{app.previewPrNumber}
    </Badge>
  );
}
