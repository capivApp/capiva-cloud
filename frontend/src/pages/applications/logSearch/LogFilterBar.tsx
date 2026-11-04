import { Download, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { cn } from "@/lib/utils";
import type { LogDownloadFormat } from "@/pages/applications/hooks/useLogs";
import {
  isValidRegex,
  LOG_INTERVAL_OPTIONS,
  LOG_LEVEL_OPTIONS,
  type LogFilterState,
  type LogInterval,
  type LogLevel,
} from "@/pages/applications/logSearch/logFilters";

const selectClass = "h-9 rounded-md border border-border bg-background px-2 text-sm";

interface DebouncedInputProps {
  value: string;
  onCommit: (value: string) => void;
  placeholder: string;
  className?: string;
  invalid?: boolean;
  icon?: boolean;
}

/** Campo de texto que só grava na URL depois de uma pausa na digitação. */
function DebouncedInput({ value, onCommit, placeholder, className, invalid, icon }: DebouncedInputProps) {
  const [draft, setDraft] = useState(value);
  const debounced = useDebouncedValue(draft);

  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (debounced !== value) onCommit(debounced);
  }, [debounced]);

  return (
    <div className={cn("relative", className)}>
      {icon && <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />}
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
        aria-invalid={invalid}
        className={cn(icon && "pl-8", invalid && "border-destructive focus-visible:ring-destructive")}
      />
    </div>
  );
}

/** ISO (UTC) ↔ valor do `<input type="datetime-local">` (hora local, sem fuso). */
const toLocalInput = (iso: string): string => {
  if (!iso) return "";
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const fromLocalInput = (local: string): string => (local ? new Date(local).toISOString() : "");

interface LogFilterBarProps {
  filters: LogFilterState;
  onChange: (patch: Partial<LogFilterState>) => void;
  pods: string[];
  onDownload: (format: LogDownloadFormat) => void;
  isDownloading: boolean;
}

export function LogFilterBar({ filters, onChange, pods, onDownload, isDownloading }: LogFilterBarProps) {
  const isRegexValid = isValidRegex(filters.regex);
  const podOptions = filters.pod && !pods.includes(filters.pod) ? [filters.pod, ...pods] : pods;

  const toggleLevel = (level: LogLevel) =>
    onChange({ levels: filters.levels.includes(level) ? filters.levels.filter((l) => l !== level) : [...filters.levels, level] });

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <DebouncedInput icon value={filters.q} onCommit={(q) => onChange({ q })} placeholder="Buscar nos logs" />
        <DebouncedInput value={filters.exclude} onCommit={(exclude) => onChange({ exclude })} placeholder="Não contém" />
        <div>
          <DebouncedInput value={filters.regex} onCommit={(regex) => onChange({ regex })} placeholder="Expressão regular" invalid={!isRegexValid} />
          {!isRegexValid && <p className="mt-1 text-xs text-destructive">Expressão regular inválida.</p>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1" role="group" aria-label="Nível">
          {LOG_LEVEL_OPTIONS.map((option) => (
            <Button
              key={option.value}
              size="sm"
              variant={filters.levels.includes(option.value) ? "secondary" : "outline"}
              aria-pressed={filters.levels.includes(option.value)}
              onClick={() => toggleLevel(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>

        <select className={selectClass} aria-label="Intervalo" value={filters.interval} onChange={(e) => onChange({ interval: e.target.value as LogInterval, start: "", end: "" })}>
          {LOG_INTERVAL_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>

        <select className={selectClass} aria-label="Pod" value={filters.pod} onChange={(e) => onChange({ pod: e.target.value })}>
          <option value="">Todos os pods</option>
          {podOptions.map((pod) => (
            <option key={pod} value={pod}>{pod}</option>
          ))}
        </select>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="ml-auto" disabled={isDownloading}>
              <Download /> Baixar
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onDownload("txt")}>Texto (.txt)</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onDownload("ndjson")}>NDJSON (.ndjson)</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {filters.interval === "custom" && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>De</span>
          <Input type="datetime-local" className="w-auto" value={toLocalInput(filters.start)} onChange={(e) => onChange({ start: fromLocalInput(e.target.value) })} />
          <span>até</span>
          <Input type="datetime-local" className="w-auto" value={toLocalInput(filters.end)} onChange={(e) => onChange({ end: fromLocalInput(e.target.value) })} />
        </div>
      )}
    </div>
  );
}
