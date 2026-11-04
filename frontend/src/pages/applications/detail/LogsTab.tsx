import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { useLogFilters, useLogs, type LogDownloadFormat } from "@/pages/applications/hooks/useLogs";
import { LogFilterBar } from "@/pages/applications/logSearch/LogFilterBar";
import { LogLineView } from "@/pages/applications/logSearch/LogLineView";

/** Aba de logs: filtros na URL, ao vivo (SSE) ou por intervalo, destaque e download. */
export function LogsTab({ applicationId }: { applicationId: string }) {
  const { filters, setFilters } = useLogFilters();
  const { isLive, lines, isLoading, isFetching, error, pods, download, isDownloading } = useLogs(applicationId, filters);
  const viewRef = useRef<HTMLDivElement>(null);
  const showPod = new Set(lines.map((l) => l.pod).filter(Boolean)).size > 1;

  // Ao vivo, acompanha o fim como um terminal.
  useEffect(() => {
    if (isLive && viewRef.current) viewRef.current.scrollTop = viewRef.current.scrollHeight;
  }, [isLive, lines]);

  const onDownload = (format: LogDownloadFormat) =>
    download(format).catch((e: Error) => toast.error(e.message || "Não foi possível baixar os logs."));

  const emptyText = isLive ? "Aguardando logs…" : "Nenhum log encontrado. Ajuste os filtros ou o intervalo.";

  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <LogFilterBar filters={filters} onChange={setFilters} pods={pods} onDownload={onDownload} isDownloading={isDownloading} />

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {isLive && (
            <span className="inline-flex items-center gap-1 text-success"><span className="size-1.5 animate-pulse rounded-full bg-current" /> Ao vivo</span>
          )}
          {!isLive && <span>{isFetching ? "Buscando…" : `${lines.length} linhas`}</span>}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div ref={viewRef} className="max-h-[32rem] overflow-auto rounded-lg bg-background p-4 font-mono text-xs leading-relaxed">
          {isLoading && <p className="text-muted-foreground">Buscando logs…</p>}
          {!isLoading && lines.length === 0 && <p className="text-muted-foreground">{emptyText}</p>}
          {lines.map((line, i) => (
            <LogLineView key={`${line.ts}-${i}`} line={line} highlight={filters.q} showPod={showPod} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
