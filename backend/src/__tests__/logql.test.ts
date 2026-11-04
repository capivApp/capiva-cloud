/**
 * Busca de logs: builder de LogQL (escape, seletor imposto pelo servidor, filtros de
 * texto, nível por formato, intervalo) e o schema Zod da query string. Funções puras,
 * sem Loki e sem banco.
 */
import { describe, expect, it } from "bun:test";
import { buildLogQL, buildLogSelector, buildLokiRangeRequest, quoteLogQL, resolveIntervalo } from "@service/logSearch/logql";
import { buildLevelPattern, detectLogLevel } from "@service/logSearch/logLevel.strategy";
import { logDownloadSchema, logFiltrosSchema } from "@schemas/logs.schema";

const scope = { namespace: "team-a", app: "api" };
const NOW = Date.parse("2026-11-04T12:00:00.000Z");
const ns = (ms: number) => String(BigInt(ms) * 1_000_000n);

const UNESCAPE: Record<string, string> = { n: "\n", r: "\r", t: "\t" };

/**
 * Lê a query inteira como o Loki leria: o seletor `{...}` e depois só estágios
 * `op "literal"`, respeitando o escape de string. Se o usuário conseguisse fechar a
 * aspa, sobraria texto fora de literal e o parser falharia, ou um matcher novo
 * apareceria no seletor.
 */
function parseQuery(query: string) {
  let i = 0;
  const readString = (): string => {
    if (query[i] !== '"') throw new Error(`esperava aspas em ${i}: ${query.slice(i)}`);
    i++;
    let value = "";
    while (query[i] !== '"') {
      if (i >= query.length) throw new Error("string sem fechamento");
      const c = query[i] === "\\" ? (UNESCAPE[query[++i]!] ?? query[i]) : query[i];
      value += c;
      i++;
    }
    i++;
    return value;
  };
  const expect = (re: RegExp): string[] => {
    const m = re.exec(query.slice(i));
    if (!m) throw new Error(`token inesperado em ${i}: ${query.slice(i)}`);
    i += m[0].length;
    return m;
  };

  expect(/^\{/);
  const matchers: Array<[string, string, string]> = [];
  while (query[i] !== "}") {
    const [, label, op] = expect(/^,?([a-zA-Z_]+)(=~|!=|!~|=)/);
    matchers.push([label!, op!, readString()]);
  }
  i++;
  const stages: Array<[string, string]> = [];
  while (i < query.length) {
    const [, op] = expect(/^ (\|=|!=|\|~|!~) /);
    stages.push([op!, readString()]);
  }
  return { matchers, stages };
}

describe("quoteLogQL", () => {
  it("envolve em aspas duplas e escapa barra, aspas e quebras de linha", () => {
    expect(quoteLogQL("simples")).toBe('"simples"');
    expect(quoteLogQL('diz "oi"')).toBe('"diz \\"oi\\""');
    expect(quoteLogQL("C:\\temp")).toBe('"C:\\\\temp"');
    expect(quoteLogQL("a\nb\tc\rd")).toBe('"a\\nb\\tc\\rd"');
  });

  it("escapa a barra antes da aspa (ordem importa)", () => {
    expect(quoteLogQL('\\"')).toBe('"\\\\\\""');
  });
});

describe("buildLogSelector", () => {
  it("impõe namespace e app do servidor", () => {
    expect(buildLogSelector(scope)).toBe('{namespace="team-a",app="api"}');
  });

  it("acrescenta o pod como matcher exato", () => {
    expect(buildLogSelector(scope, "api-7c9f-abc12")).toBe('{namespace="team-a",app="api",pod="api-7c9f-abc12"}');
  });
});

describe("buildLogQL: isolamento do tenant", () => {
  const ataques = [
    '"} |= "" or {namespace="outro',
    '",namespace="kube-system',
    '\\"}{namespace=~".+',
    "`} |~ `.*",
    'x"}\n{namespace="outro"}',
  ];

  for (const ataque of ataques) {
    it(`nunca escapa do próprio namespace/app: ${JSON.stringify(ataque)}`, () => {
      const query = buildLogQL(scope, { contains: ataque, notContains: ataque, regex: ataque, pod: ataque });
      const { matchers, stages } = parseQuery(query);
      expect(matchers).toEqual([
        ["namespace", "=", "team-a"],
        ["app", "=", "api"],
        ["pod", "=", ataque],
      ]);
      expect(stages).toEqual([
        ["|=", ataque],
        ["!=", ataque],
        ["|~", ataque],
      ]);
    });
  }

  // Prova de que o parser do teste pega a injeção quando NÃO há escape.
  it("o parser do teste recusa uma query concatenada sem escape", () => {
    expect(() => parseQuery('{namespace="team-a",app="api"} |= "" or {namespace="outro"}')).toThrow();
    expect(parseQuery('{namespace="team-a",app="api",namespace="outro"}').matchers).toHaveLength(3);
  });

  it("escapa o próprio namespace/app vindos do banco", () => {
    const query = buildLogQL({ namespace: 'ns"x', app: "a\\b" }, {});
    expect(parseQuery(query).matchers).toEqual([
      ["namespace", "=", 'ns"x'],
      ["app", "=", "a\\b"],
    ]);
  });
});

describe("buildLogQL: filtros de linha", () => {
  it("sem filtro, é só o seletor", () => {
    expect(buildLogQL(scope, {})).toBe('{namespace="team-a",app="api"}');
  });

  it("contém, não contém e regex, nessa ordem", () => {
    expect(buildLogQL(scope, { contains: "timeout", notContains: "/health", regex: "user=\\d+" })).toBe(
      '{namespace="team-a",app="api"} |= "timeout" != "/health" |~ "user=\\\\d+"',
    );
  });

  it("ignora texto vazio", () => {
    expect(buildLogQL(scope, { contains: "", notContains: "", regex: "" })).toBe('{namespace="team-a",app="api"}');
  });

  it("nível vira um filtro de regex que cobre todos os formatos", () => {
    const query = buildLogQL(scope, { levels: ["error"] });
    expect(query).toBe(`{namespace="team-a",app="api"} |~ ${quoteLogQL(buildLevelPattern(["error"]))}`);
  });
});

describe("nível por formato (strategy)", () => {
  const casos: Array<[string, string | null]> = [
    ['{"level":"error","msg":"falhou"}', "error"],
    ['{"msg":"x","level": "WARN"}', "warn"],
    ['{"severity":"info"}', "info"],
    ['{"level":50,"msg":"pino"}', "error"],
    ['{"level":40}', "warn"],
    ['{"level":30}', "info"],
    ['{"level":20}', "debug"],
    ["time=2026 level=error msg=boom", "error"],
    ['lvl="warning" msg=lento', "warn"],
    ["2026-11-04 ERROR conexão recusada", "error"],
    ["[WARN] fila cheia", "warn"],
    ["INFO server listening on :3000", "info"],
    ["DEBUG payload recebido", "debug"],
    ["2026/11/04 [error] 31#31: upstream timed out", "error"],
    ["GET /health 200 2ms", null],
    ["no errors found", null],
    ["ERRORS=0 TERRORISMO", null],
  ];

  for (const [linha, nivel] of casos) {
    it(`${JSON.stringify(linha)} → ${nivel}`, () => {
      expect(detectLogLevel(linha)).toBe(nivel as never);
    });
  }

  it("o padrão do nível casa as mesmas linhas que a detecção", () => {
    const pattern = new RegExp(buildLevelPattern(["error", "warn"]));
    for (const [linha, nivel] of casos) {
      expect(pattern.test(linha)).toBe(nivel === "error" || nivel === "warn");
    }
  });
});

describe("resolveIntervalo", () => {
  it("'últimos N' conta a partir de agora", () => {
    expect(resolveIntervalo({ since: "15m" }, NOW)).toEqual({ start: ns(NOW - 15 * 60_000), end: ns(NOW) });
    expect(resolveIntervalo({ since: "1h" }, NOW)).toEqual({ start: ns(NOW - 3_600_000), end: ns(NOW) });
    expect(resolveIntervalo({ since: "24h" }, NOW)).toEqual({ start: ns(NOW - 86_400_000), end: ns(NOW) });
  });

  it("sem nada, usa a última hora", () => {
    expect(resolveIntervalo({}, NOW)).toEqual({ start: ns(NOW - 3_600_000), end: ns(NOW) });
  });

  it("início/fim explícitos vencem o 'últimos N'", () => {
    const start = "2026-11-01T10:00:00.000Z";
    const end = "2026-11-01T11:00:00.000Z";
    expect(resolveIntervalo({ since: "15m", start, end }, NOW)).toEqual({ start: ns(Date.parse(start)), end: ns(Date.parse(end)) });
  });

  it("só início: vai até agora", () => {
    const start = "2026-11-04T11:00:00.000Z";
    expect(resolveIntervalo({ start }, NOW)).toEqual({ start: ns(Date.parse(start)), end: ns(NOW) });
  });
});

describe("buildLokiRangeRequest", () => {
  it("junta query, intervalo, limite e direção, com defaults", () => {
    expect(buildLokiRangeRequest(scope, { contains: "x" }, NOW)).toEqual({
      query: '{namespace="team-a",app="api"} |= "x"',
      start: ns(NOW - 3_600_000),
      end: ns(NOW),
      limit: 200,
      direction: "backward",
      filtros: { contains: "x" },
    });
  });

  it("respeita limite e direção pedidos", () => {
    const req = buildLokiRangeRequest(scope, { limit: 1000, direction: "forward" }, NOW);
    expect(req.limit).toBe(1000);
    expect(req.direction).toBe("forward");
  });
});

describe("logFiltrosSchema (query string)", () => {
  it("converte a query string em filtros tipados", () => {
    const parsed = logFiltrosSchema.parse({ q: "timeout", exclude: "health", level: "error,warn", pod: "api-1", since: "15m", limit: "500", direction: "forward" });
    expect(parsed).toEqual({ contains: "timeout", notContains: "health", levels: ["error", "warn"], pod: "api-1", since: "15m", limit: 500, direction: "forward" });
  });

  it("descarta chaves que não são filtro (namespace/app nunca vêm do usuário)", () => {
    const parsed = logFiltrosSchema.parse({ namespace: "kube-system", app: "traefik", access_token: "t", org: "o" });
    expect(parsed).toEqual({});
  });

  it("recusa regex inválida com mensagem em português", () => {
    const parsed = logFiltrosSchema.safeParse({ regex: "(abc" });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe("Expressão regular inválida.");
  });

  it("recusa nível desconhecido, pod fora do padrão e limite acima do máximo", () => {
    expect(logFiltrosSchema.safeParse({ level: "verbose" }).success).toBe(false);
    expect(logFiltrosSchema.safeParse({ pod: 'api"}' }).success).toBe(false);
    expect(logFiltrosSchema.safeParse({ limit: "999999" }).error?.issues[0]?.message).toBe("Use um limite entre 1 e 5000 linhas.");
  });

  it("recusa início depois do fim", () => {
    const parsed = logFiltrosSchema.safeParse({ start: "2026-11-02T00:00:00.000Z", end: "2026-11-01T00:00:00.000Z" });
    expect(parsed.error?.issues[0]?.message).toBe("O início precisa ser anterior ao fim.");
  });

  it("recusa data em formato livre", () => {
    expect(logFiltrosSchema.safeParse({ start: "ontem" }).error?.issues[0]?.message).toBe("Informe a data no formato ISO 8601.");
  });
});

describe("logDownloadSchema", () => {
  it("formato padrão é txt e o máximo de linhas tem teto", () => {
    expect(logDownloadSchema.parse({})).toMatchObject({ format: "txt", maxLines: 10_000 });
    expect(logDownloadSchema.parse({ format: "ndjson", maxLines: "20" })).toMatchObject({ format: "ndjson", maxLines: 20 });
    expect(logDownloadSchema.safeParse({ maxLines: "1000000" }).error?.issues[0]?.message).toBe("Use um máximo entre 1 e 50000 linhas.");
    expect(logDownloadSchema.safeParse({ format: "csv" }).success).toBe(false);
  });
});
