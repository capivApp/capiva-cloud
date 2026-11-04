import type { LogExportFormat, LogLine } from "@interface/logs";

/** Formato do arquivo de download de logs. Formato novo = uma entrada no mapa. */
export interface LogExportStrategy {
  readonly contentType: string;
  readonly extension: string;
  serialize(line: LogLine): string;
}

const isoOf = (tsNs: string): string => new Date(Number(BigInt(tsNs) / 1_000_000n)).toISOString();

const txt: LogExportStrategy = {
  contentType: "text/plain; charset=utf-8",
  extension: "txt",
  serialize: (l) => `${isoOf(l.ts)} ${l.pod ? `[${l.pod}] ` : ""}${l.line}\n`,
};

const ndjson: LogExportStrategy = {
  contentType: "application/x-ndjson; charset=utf-8",
  extension: "ndjson",
  serialize: (l) => `${JSON.stringify({ time: isoOf(l.ts), ts: l.ts, pod: l.pod, level: l.level, line: l.line })}\n`,
};

const FORMATS: Record<LogExportFormat, LogExportStrategy> = { txt, ndjson };

export const createLogExportFormat = (format: LogExportFormat): LogExportStrategy => FORMATS[format];
