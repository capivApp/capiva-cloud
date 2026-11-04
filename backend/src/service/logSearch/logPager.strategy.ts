import type { LogDirection, LogLine, LogRangeRequest } from "@interface/logs";

/**
 * Próxima página de uma consulta ao Loki, por direção. O `end` do `query_range` é
 * exclusivo: para trás basta encostar o fim na linha mais antiga; para frente o início
 * anda 1 ns além da mais nova, senão a última linha viria de novo.
 */
type Pager = (request: LogRangeRequest, page: LogLine[]) => Pick<LogRangeRequest, "start" | "end">;

const tsOf = (l: LogLine) => BigInt(l.ts);
const min = (page: LogLine[]) => page.map(tsOf).reduce((a, b) => (b < a ? b : a));
const max = (page: LogLine[]) => page.map(tsOf).reduce((a, b) => (b > a ? b : a));

const PAGERS: Record<LogDirection, Pager> = {
  backward: (req, page) => ({ start: req.start, end: String(min(page)) }),
  forward: (req, page) => ({ start: String(max(page) + 1n), end: req.end }),
};

const COMPARATORS: Record<LogDirection, (a: LogLine, b: LogLine) => number> = {
  forward: (a, b) => Number(tsOf(a) - tsOf(b)),
  backward: (a, b) => Number(tsOf(b) - tsOf(a)),
};

export const nextPageWindow = (request: LogRangeRequest, page: LogLine[]) =>
  PAGERS[request.direction](request, page);

/** O Loki devolve um bloco por stream (pod); a ordem global sai daqui. */
export const sortLogLines = (lines: LogLine[], direction: LogDirection): LogLine[] =>
  [...lines].sort(COMPARATORS[direction]);
