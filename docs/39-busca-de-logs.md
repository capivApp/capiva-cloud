# 39. Busca de logs: filtros, nível, intervalo e download

Antes, a aba Logs só mostrava o live tail (últimos 30 min, 200 linhas, sem filtro).
`ObservabilityService.logs` montava `{namespace="…",app="…"}` concatenando string, e
nada era escapado. Agora:

- dá para filtrar por texto, nível, pod e intervalo;
- a consulta ao Loki sai de um builder de LogQL que é uma função pura;
- dá para baixar o resultado em `.txt` ou `.ndjson`.

## Builder de LogQL (`backend/src/service/logSearch/logql.ts`)

`buildLogQL(scope, filtros)` monta, nesta ordem:

```
{namespace="<ns>",app="<app>"[,pod="<pod>"]} |= "<contém>" != "<não contém>" |~ "<regex>" |~ "<nível>"
```

- **O seletor é sempre o do servidor.** `scope` (`namespace`, `app`) vem do banco via
  `ObservabilityService.logScopeOf`, nunca da request. O schema Zod nem aceita esses campos,
  e `z.object` descarta chave desconhecida.
- **Todo valor entra como string literal escapada** (`quoteLogQL`: `\`, `"`, `\n`, `\r`,
  `\t`). Sem isso, um `"}` na busca fecharia o seletor e abriria outro, lendo o namespace de
  outro tenant. O teste `logql.test.ts > isolamento do tenant` faz o parse da query como o
  Loki faria e confere que o seletor continua com exatamente `namespace` e `app` do servidor
  e que todo o resto é `op "literal"`.
- O pod também é validado no Zod (`^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$`), mas o escape vale do
  mesmo jeito.
- Intervalo (`resolveIntervalo`): `start`/`end` (ISO 8601) vencem `since` (`15m`, `1h`,
  `24h`); sem nada, última hora; só `start`, vai até agora. Janela máxima de 30 dias.
- `limit` de 1 a 5000 (padrão 200), `direction` `backward` (padrão) ou `forward`.

## Nível por formato (`logLevel.strategy.ts`)

Strategy por formato de linha. Cada formato escreve o regex que reconhece um nível:

| Formato | Exemplo reconhecido |
| --- | --- |
| JSON | `{"level":"error"}`, `{"severity":"WARN"}`, pino `{"level":50}` |
| logfmt | `level=error`, `lvl="warning"` |
| texto | `ERROR`, `[WARN]`, nginx `[error]` |

Sinônimos: erro = `error/err/fatal/critical/panic` (pino 50, 60); aviso = `warn/warning`
(40); info = `info/notice` (30); debug = `debug/trace` (20, 10). Palavra minúscula solta em
texto livre não conta, senão "no errors" viraria erro.

O mesmo padrão serve para o filtro `|~` no Loki e para `detectLogLevel` em memória, que
preenche o `level` de cada linha devolvida. Assim, o que a tela pinta de erro é o que o filtro
de erro devolve. Os padrões só usam o que RE2 e JS têm em comum (`(?i:…)`, `\b`, `\s`).
Formato novo = um objeto novo em `LOG_FORMATS`.

## Endpoints

Todos autenticados, escopados pela organização ativa, com os mesmos filtros na query string:
`q` (contém), `exclude` (não contém), `regex`, `level` (`error,warn`), `pod`, `since`,
`start`, `end`, `limit`, `direction`. Erro de validação devolve 422 com mensagens em português.
Se o Loki recusar o filtro (regex RE2 inválida), a resposta é 400.

- `GET /api/applications/:id/logs`: `{ lines: [{ ts, line, pod?, level? }] }`, em ordem
  cronológica. `direction` escolhe qual ponta da janela vem quando passa do limite.
- `GET /api/applications/:id/logs/pods`: `{ pods }`, valores do label `pod` no intervalo
  (consulta só o seletor do tenant).
- `GET /api/applications/:id/logs/download?format=txt|ndjson&maxLines=N`: arquivo em
  streaming. `LogSearch.export` pagina o Loki em blocos de até 5000 linhas, até `maxLines`
  (padrão 10.000, teto 50.000). Para trás, o `end` da próxima página encosta na linha mais
  antiga (o `end` do Loki é exclusivo); para frente, o `start` anda 1 ns além da mais nova.
  Um erro antes do primeiro byte vira JSON; depois disso o arquivo é encerrado.
  - `.txt`: `2026-11-04T12:00:00.000Z [pod] linha`
  - `.ndjson`: `{"time","ts","pod","level","line"}` por linha
- SSE `GET /api/streams/applications/:id/logs`: o live tail aceita `q`, `exclude`, `regex`,
  `level` e `pod`. Janela e limite continuam os de antes (30 min, 200 linhas). Se o Loki
  recusar o filtro, o stream manda lista vazia em vez de cair.

Documentados no OpenAPI (`/docs`).

## Sem Loki (`LOKI_URL` vazio)

`createLogSource` (factory em `infra/observability/logSources.ts`) escolhe a fonte:

- `LokiLogSource`: HTTP. Falha de rede cai na fonte simulada, como antes.
- `SimulatedLogSource`: as mesmas 4 linhas de exemplo de antes. Os filtros de texto, regex e
  nível valem sobre elas (`buildLogPredicate`, mesmos padrões do LogQL). A lista de pods vem
  vazia e o download funciona.

`LokiAdapter.queryBySelector` (usado pela tela de Requests) não mudou.

## Frontend

Aba Logs do detalhe da aplicação (`pages/applications/detail/LogsTab.tsx`):

- barra de filtros (`logSearch/LogFilterBar.tsx`): busca, "não contém" e regex com debounce de
  400 ms (regex inválida é marcada no campo e não vai para a API), botões de nível, intervalo
  (Ao vivo, 15 min, 1 h, 24 h, Personalizado com início/fim) e pod;
- "Ao vivo" usa o SSE com os filtros; um intervalo usa `GET /logs` via React Query
  (`hooks/useLogs.ts`);
- termo buscado destacado com `<mark>`, sensível a maiúsculas como o `|=`; cor por nível; pod
  na linha quando há mais de um;
- botão Baixar (`.txt` ou `.ndjson`) com os filtros atuais, via `api.download` (mesmo token e
  refresh do client HTTP);
- **filtros e aba na URL** (`?tab=logs&q=timeout&level=error&since=1h`): o link abre a mesma
  busca. Conversão URL ↔ estado ↔ query da API em `logSearch/logFilters.ts`.

## Testes

- `backend/src/__tests__/logql.test.ts`: escape, isolamento do tenant, filtros, níveis,
  intervalo, schema Zod.
- `backend/src/__tests__/logSearch.test.ts`: ordem, paginação do download, formatos, fonte
  simulada.
- `backend/src/__tests__/lokiLogSource.test.ts`: contra um Loki falso (`Bun.serve`).
- `backend/src/__tests__/logDownload.test.ts`: controller com Express real (422, streaming,
  erro antes do primeiro byte).
- `frontend/tests/logFilters.test.ts`: URL ↔ estado, query por modo, destaque. Fica fora de
  `src` porque o tsconfig do frontend não carrega os tipos do `bun:test`; rode `bun test`
  em `frontend/`.

## Observação

O label do pod é `pod` (`POD_LABEL` em `logql.ts`), o padrão do coletor Kubernetes
(promtail/alloy). Se o coletor usar outro nome, troque ali.
