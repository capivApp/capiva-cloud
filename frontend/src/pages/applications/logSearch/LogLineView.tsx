import { cn } from "@/lib/utils";
import type { LogLine } from "@/pages/applications/hooks/useLogs";
import { splitHighlight, type LogLevel } from "@/pages/applications/logSearch/logFilters";

const LEVEL_CLASS: Record<LogLevel, string> = {
  error: "text-destructive",
  warn: "text-amber-500",
  info: "text-foreground/80",
  debug: "text-muted-foreground/70",
};

const timeOf = (tsNs: string): string => new Date(Number(BigInt(tsNs) / 1_000_000n)).toLocaleTimeString("pt-BR");

interface LogLineViewProps {
  line: LogLine;
  highlight: string;
  showPod: boolean;
}

/** Uma linha de log: hora, pod (quando há mais de um) e o texto com o termo buscado marcado. */
export function LogLineView({ line, highlight, showPod }: LogLineViewProps) {
  return (
    <div className={cn("whitespace-pre-wrap break-all", line.level ? LEVEL_CLASS[line.level] : "text-muted-foreground")}>
      <span className="mr-2 select-none text-muted-foreground/60">{timeOf(line.ts)}</span>
      {showPod && line.pod && <span className="mr-2 text-primary/80">[{line.pod}]</span>}
      {splitHighlight(line.line, highlight).map((part, i) =>
        part.match ? (
          <mark key={i} className="rounded-sm bg-amber-400/40 px-0.5 text-foreground">{part.text}</mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </div>
  );
}
