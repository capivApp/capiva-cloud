import type { LogFiltros, LogLine, LogScope, LogSource } from "@interface/logs";
import { LOG_QUERY_MAX_LIMIT } from "@schemas/logs.schema";
import { detectLogLevel } from "@service/logSearch/logLevel.strategy";
import { nextPageWindow, sortLogLines } from "@service/logSearch/logPager.strategy";
import { buildLogSelector, buildLokiRangeRequest, POD_LABEL } from "@service/logSearch/logql";

const withLevel = (line: LogLine): LogLine => ({ ...line, level: detectLogLevel(line.line) ?? undefined });

/**
 * Busca de logs de UMA aplicação: monta o pedido (escopo do servidor + filtros do
 * usuário), consulta a fonte e devolve as linhas ordenadas com o nível detectado.
 * Não conhece HTTP nem banco: quem resolve o escopo é o ObservabilityService.
 */
export class LogSearch {
  constructor(
    private readonly source: LogSource,
    private readonly now: () => number = Date.now,
    private readonly pageSize: number = LOG_QUERY_MAX_LIMIT,
  ) {}

  /** Linhas em ordem cronológica; `direction` escolhe qual ponta da janela vem. */
  async search(scope: LogScope, filtros: LogFiltros): Promise<{ lines: LogLine[] }> {
    const request = buildLokiRangeRequest(scope, filtros, this.now());
    const lines = await this.source.range(request);
    return { lines: sortLogLines(lines, "forward").map(withLevel) };
  }

  /** Pods com log na janela. Consulta só o seletor do tenant: o filtro de pod não entra. */
  async pods(scope: LogScope, filtros: LogFiltros): Promise<string[]> {
    const request = buildLokiRangeRequest(scope, filtros, this.now());
    const pods = await this.source.labelValues(POD_LABEL, { ...request, query: buildLogSelector(scope) });
    return [...pods].sort();
  }

  /**
   * Páginas para o download, na ordem de `direction`, até `maxLines`. Gerador: quem
   * consome escreve cada página na resposta e nunca segura o arquivo inteiro.
   */
  async *export(scope: LogScope, filtros: LogFiltros, maxLines: number): AsyncGenerator<LogLine[]> {
    let request = buildLokiRangeRequest(scope, filtros, this.now());
    let remaining = maxLines;
    while (remaining > 0) {
      const limit = Math.min(this.pageSize, remaining);
      const page = sortLogLines(await this.source.range({ ...request, limit }), request.direction).map(withLevel);
      if (page.length === 0) return;
      yield page.slice(0, remaining);
      remaining -= page.length;
      if (page.length < limit) return;
      request = { ...request, ...nextPageWindow(request, page) };
    }
  }
}
