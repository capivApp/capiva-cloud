# 35. Eventos de notificação e alertas por métrica

Os canais de notificação (`NotificationService`) escolhem quais eventos escutam. Até
aqui só `deploy.succeeded` e `deploy.failed` eram disparados; `deploy.rollback`, `downtime` e
`recovery` estavam no catálogo sem ninguém chamando `dispatch`. Agora todos disparam, e há dois
eventos novos: `alert.triggered` e `alert.resolved`.

## Regra comum: só na transição

Uptime e alertas notificam quando o estado **muda**, nunca a cada amostra. Sem isso, uma
aplicação fora do ar mandaria uma mensagem por minuto até alguém desligar o canal.

A detecção é pura, em `@functions/stateTransition`:

| Função | Entrada | Saída |
| --- | --- | --- |
| `detectTransition(prev, atual)` | dois booleanos | `rising`, `falling` ou `null` |
| `uptimeEventFor(prevOk, ok)` | amostra anterior e atual | `downtime`, `recovery` ou `null` |
| `alertEventFor(prev, atual)` | `OK`/`FIRING` | `alert.triggered`, `alert.resolved` ou `null` |

Sem histórico, o uptime parte de "no ar": a primeira falha já avisa, o primeiro sucesso não.

## `downtime` e `recovery`

`UptimeService.runCheck` sonda a URL, lê a amostra anterior (`recentResults(id, 1)`) e grava a
nova na mesma transação. Se a gravação falhar, não notifica (o histórico não seria confiável e
o aviso se repetiria no próximo ciclo). O texto sai de `buildUptimeMessage`
(`@functions/alertMessages`). `UptimeRepository.listEnabled`/`findCheck` passaram a incluir o
nome da aplicação e a organização (`UptimeCheckWithOwner`), que o scheduler precisa para
despachar fora de um request.

## `deploy.rollback`

Disparado em três caminhos:

1. **Rollback manual** (`POST /applications/:id/rollback`) e
2. **rollback automático após falha** do deploy: ambos passam por
   `DeploymentService.rollbackTo`, que notifica ao concluir ("Rollback" ou "Rollback automático").
3. **Abort do Argo Rollouts**: quando a análise do canary/blue-green falha, o Argo aborta e
   mantém a versão estável. `isRolloutAborted(status)` (`@functions/rolloutStatus`) reconhece
   `status.abort === true` ou fase `Degraded` com `RolloutAborted`. A checagem roda no
   `awaitReady` do deploy.

Limite conhecido do item 3: o `awaitReady` só observa o rollout durante a espera de readiness
(até 180 s). Num canary longo, o abort que acontece depois dessa janela não é visto. Pegar
esses casos exige um observador contínuo dos Rollouts (fica como evolução).

## Alertas por métrica

### Modelo

`AlertRule` (migration `20261104120000_alert_rules`), filha da aplicação (cascade):

| Campo | Significado |
| --- | --- |
| `metric` | `CPU` (% de um núcleo, 100 = 1 vCPU), `MEMORY` (MiB), `ERROR_RATE_5XX` (% de respostas 5xx), `LATENCY_P95` (ms) |
| `operator` | `GT` (acima de) ou `LT` (abaixo de) |
| `threshold` | limite, na unidade da métrica |
| `windowMinutes` | janela de avaliação (1 a 60) |
| `enabled` | desligar volta o estado para `OK` sem notificar |
| `state` | `OK` ou `FIRING`: o estado atual, base da detecção de transição |
| `lastValue`, `lastEvaluatedAt`, `lastTransitionAt` | última medição e última mudança |

O escopo multi-tenant é `alertRule: byApplication` em `@database/tenantScope`.

Os canais não ficam na regra: são **herdados do mecanismo de eventos**. Quem quer receber
alertas marca `alert.triggered`/`alert.resolved` no canal, na tela de Notificações.

### Fontes de métrica (Strategy por métrica)

`@infra/alerts/alertMetric.strategy` expõe `createAlertMetricStrategies(sources)`, um mapa
`Record<AlertMetric, AlertMetricStrategy>`. Cada strategy mede a métrica na janela e devolve
`null` quando não há dado. Nenhuma usa valor simulado: `ObservabilityService.metrics` sintetiza
números para a tela sem Prometheus, e um alerta com dado inventado dispararia sozinho.

| Métrica | Fonte principal | Reserva |
| --- | --- | --- |
| CPU | Prometheus: `rate(container_cpu_usage_seconds_total[janela])` | metrics-server (`topPods`), leitura instantânea |
| Memória | Prometheus: `avg_over_time(container_memory_working_set_bytes[janela])` | metrics-server (`topPods`) |
| Taxa de 5xx | access log do Traefik no Loki (`LokiAdapter.queryWindow`) | nenhuma |
| Latência p95 | access log do Traefik no Loki | nenhuma |

Notas:

* Os pods da app são reconhecidos pelo prefixo `<nome-da-app>-`, no Prometheus e no
  metrics-server.
* 5xx e p95 exigem domínio na aplicação: sem host, o seletor do Traefik pegaria o tráfego de
  todo o cluster, então a strategy devolve `null` sem consultar o Loki.
* `LokiAdapter.queryWindow` é novo e, ao contrário de `queryBySelector`, devolve `null` sem
  `LOKI_URL` ou em erro, em vez de linhas simuladas.
* O parse do access log e o seletor do Traefik saíram do `RequestsService` para
  `@functions/requestStats` (`parseTraefikAccessLog`, `buildTraefikSelector`), junto com
  `computeErrorRate5xx` e `computePercentile` (nearest-rank). O `RequestsService` usa as
  mesmas funções, e o `hostOf` dele virou público para os alertas resolverem o domínio.

### Avaliação

`evaluateAlertRule(rule, valor)` (`@functions/alertEvaluation`) devolve o próximo estado e o
evento. Sem dado (`null`) o estado é mantido: uma fonte fora do ar não resolve um alerta
disparado nem dispara um que estava OK.

`AlertService.evaluateAll` lista as regras habilitadas de todas as organizações, resolve o alvo
uma vez por aplicação (namespace e kubeconfig via `KubeContextResolver`, domínio via
`RequestsService.hostOf`), mede, grava o estado e, na transição, despacha a mensagem de
`buildAlertMessage` para a organização dona.

### Scheduler

`startAlertScheduler` (`@infra/scheduler/alertScheduler`) roda a cada 60 s com
`withLeadership("scheduler:alerts")`. Com N réplicas avaliando ao mesmo tempo, duas veriam a
mesma transição e o canal receberia o alerta em dobro. A lease é liberada no shutdown junto com
as de uptime e backup.

### API

| Método | Rota | Papel |
| --- | --- | --- |
| GET | `/api/applications/:id/alert-rules` | VIEWER+ |
| POST | `/api/applications/:id/alert-rules` | DEVELOPER+ |
| PATCH | `/api/applications/:id/alert-rules/:ruleId` | DEVELOPER+ |
| DELETE | `/api/applications/:id/alert-rules/:ruleId` | DEVELOPER+ |

Corpo validado por `@schemas/alert.schema` (mensagens em português). O PATCH não tem defaults:
campo ausente fica como está. Create e update releem a regra pelo `getById`. Tudo documentado
em `/docs` (OpenAPI), inclusive `GET /notifications/events`.

### UI

* Aba **Alertas** no detalhe da aplicação (`AlertsTab` + hook `useAlertRules`): lista as regras
  com estado (Normal, Disparado, Desligado) e último valor, liga/desliga, remove e cria regra
  (React Hook Form + Zod; erro de validação da API volta para o campo).
* Tela de **Notificações**: os eventos vêm de `GET /notifications/events`, então
  `alert.triggered` e `alert.resolved` já aparecem para marcar, com rótulo em português.

## Testes

`bun test` em `backend`:

* `stateTransition.test.ts`: transições e eventos de uptime e de alerta.
* `alertEvaluation.test.ts`: operadores, próximo estado, sem dado.
* `alertMetricStrategy.test.ts`: Prometheus, reserva do metrics-server, Loki, regra do domínio.
* `requestStats.test.ts`: parse do access log, taxa de 5xx, percentil.
* `rolloutStatus.test.ts`: reconhecimento do abort do Argo.
* `alertMessages.test.ts`: textos das notificações (sem travessão).
