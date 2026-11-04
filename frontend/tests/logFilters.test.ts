/**
 * Filtros da tela de logs: leitura e escrita na URL (para compartilhar), query string
 * enviada à API em cada modo (ao vivo, busca, download) e destaque do termo. Funções
 * puras, sem React.
 *
 * Fica fora de `src` porque o tsconfig do frontend não carrega os tipos do `bun:test`.
 * Rodar com `bun test` dentro de `frontend/`.
 */
import { describe, expect, it } from "bun:test";
import { buildLogQuery, isValidRegex, readLogFilters, splitHighlight, writeLogFilters } from "@/pages/applications/logSearch/logFilters";

const params = (qs: string) => new URLSearchParams(qs);

describe("readLogFilters", () => {
  it("sem nada na URL: ao vivo e sem filtro", () => {
    expect(readLogFilters(params(""))).toEqual({ q: "", exclude: "", regex: "", levels: [], pod: "", interval: "live", start: "", end: "" });
  });

  it("lê todos os filtros e ignora nível e intervalo desconhecidos", () => {
    const state = readLogFilters(params("tab=logs&q=timeout&exclude=health&regex=a.b&level=error,verbose,warn&pod=api-1&since=15m"));
    expect(state).toEqual({ q: "timeout", exclude: "health", regex: "a.b", levels: ["error", "warn"], pod: "api-1", interval: "15m", start: "", end: "" });
    expect(readLogFilters(params("since=7d")).interval).toBe("live");
  });
});

describe("writeLogFilters", () => {
  it("mantém os outros parâmetros e apaga os vazios", () => {
    const next = writeLogFilters(params("tab=logs&q=velho&pod=api-1"), { q: "novo", pod: "" });
    expect(next.toString()).toBe("tab=logs&q=novo");
  });

  it("nível vira lista separada por vírgula; ao vivo não aparece na URL", () => {
    expect(writeLogFilters(params(""), { levels: ["error", "warn"], interval: "live" }).toString()).toBe("level=error%2Cwarn");
    expect(writeLogFilters(params("since=1h"), { interval: "live" }).toString()).toBe("");
  });

  it("ida e volta preserva o estado", () => {
    const state = { q: 'a "b"', exclude: "", regex: "x+", levels: ["debug" as const], pod: "p", interval: "custom" as const, start: "2026-11-01T10:00:00.000Z", end: "2026-11-01T11:00:00.000Z" };
    expect(readLogFilters(writeLogFilters(params(""), state))).toEqual(state);
  });
});

describe("buildLogQuery", () => {
  const base = readLogFilters(params("q=erro&exclude=health&level=error&pod=api-1"));

  it("ao vivo: só texto, nível e pod", () => {
    expect(buildLogQuery({ ...base, interval: "live" }, "live")).toBe("q=erro&exclude=health&level=error&pod=api-1");
  });

  it("busca: inclui o intervalo", () => {
    expect(buildLogQuery({ ...base, interval: "24h" }, "search")).toBe("q=erro&exclude=health&level=error&pod=api-1&since=24h");
    expect(buildLogQuery({ ...base, interval: "custom", start: "2026-11-01T10:00:00.000Z", end: "" }, "search")).toBe(
      "q=erro&exclude=health&level=error&pod=api-1&start=2026-11-01T10%3A00%3A00.000Z",
    );
  });

  it("ao vivo na busca e no download vale como a última hora", () => {
    expect(buildLogQuery({ ...base, interval: "live" }, "search")).toContain("since=1h");
  });

  it("regex inválida não é enviada", () => {
    expect(buildLogQuery({ ...base, regex: "(abc" }, "search")).not.toContain("regex");
    expect(buildLogQuery({ ...base, regex: "a+" }, "search")).toContain("regex=a%2B");
  });
});

describe("splitHighlight", () => {
  it("separa as ocorrências do termo, diferenciando maiúsculas como o Loki", () => {
    expect(splitHighlight("erro: Erro de erro", "erro")).toEqual([
      { text: "erro", match: true },
      { text: ": Erro de ", match: false },
      { text: "erro", match: true },
    ]);
  });

  it("sem termo, a linha inteira", () => {
    expect(splitHighlight("abc", "")).toEqual([{ text: "abc", match: false }]);
  });

  it("termo com caractere de regex é literal", () => {
    expect(splitHighlight("a.b axb", "a.b")).toEqual([
      { text: "a.b", match: true },
      { text: " axb", match: false },
    ]);
  });
});

describe("isValidRegex", () => {
  it("aceita vazio e regex válida, recusa a quebrada", () => {
    expect(isValidRegex("")).toBe(true);
    expect(isValidRegex("a+b")).toBe(true);
    expect(isValidRegex("(abc")).toBe(false);
  });
});
