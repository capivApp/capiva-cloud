import type { Application, PreviewApplication } from "@/pages/applications/hooks/useApplications";

export interface PreviewInfo {
  number: number | null;
  title: string | null;
  branch: string | null;
  url: string | null;
  pullRequestUrl: string | null;
}

const SCHEME_BY_TLS: Record<string, string> = { none: "http" };

const buildPreviewUrl = (domain: { host: string; tlsMode: string } | undefined): string | null =>
  domain ? `${SCHEME_BY_TLS[domain.tlsMode] ?? "https"}://${domain.host}` : null;

/** Metadados do PR gravados pelo backend em `sourceConfig.preview`. */
export function readPreviewInfo(preview: PreviewApplication): PreviewInfo {
  const meta = (preview.sourceConfig?.preview ?? {}) as Record<string, unknown>;
  return {
    number: preview.previewPrNumber,
    title: (meta.title as string) ?? null,
    branch: (meta.sourceBranch as string) ?? (preview.sourceConfig?.branch as string) ?? null,
    url: buildPreviewUrl(preview.domains?.[0]),
    pullRequestUrl: (meta.url as string) ?? null,
  };
}

/** Previews só existem para aplicações ligadas a uma conexão Git que não são, elas mesmas, preview. */
export const isPreviewDisponivel = (app: Pick<Application, "gitConnectionId" | "previewOfId">): boolean =>
  Boolean(app.gitConnectionId) && !app.previewOfId;
