# 22. Terminal Web (exec interativo no pod)

Shell interativo (TTY) num container da aplicação, direto no painel — sem `kubectl`,
sem YAML. É o recurso mais sentido num painel k8s.

## Transporte (decisão)

O exec **servidor↔cluster** usa o `Exec` do `@kubernetes/client-node` (WebSocket para o
API server, já compatível com o TLS self-signed via `NODE_TLS_REJECT_UNAUTHORIZED`).

O canal **browser↔servidor** usa **WebSocket nativo do Bun** (`Bun.serve`) numa **porta
dedicada** (`TERMINAL_WS_PORT`, default `PORT+1`), em vez de acoplar `ws` ao Express. Mais
robusto sob Bun e isola o tráfego de terminal do HTTP da API.

## Backend

- `TerminalGateway` (`infra/realtime`): `Bun.serve` na porta dedicada. Caminho
  `/terminal/applications/:id`. Auth por `?access_token=` + `&org=` (igual ao SSE):
  valida assinatura do access token e sessão ativa (`SessionService.isActive`).
- `TerminalService` (`@service`): regra de negócio "qual pod" —
  `resolveTarget(appId, tenant)` valida posse via `ApplicationService.getById`, resolve o
  `KubeContext` do ambiente e escolhe um pod Running
  (`KubernetesAdapter.firstRunningPod`, selector `app.kubernetes.io/name=<app>`).
- `KubernetesAdapter.execShell`: abre o exec (TTY), entrega handles `write/resize/close`.
  Resize usa o **canal 4** do protocolo de exec (`{Width,Height}`).

### Protocolo do WebSocket

- Browser → servidor: **stdin como texto**; **resize como frame binário** (JSON
  `{cols,rows}`) — separar por tipo evita colisão com teclas de controle (ex.: Ctrl-A).
- Servidor → browser: saída do shell como texto.

## Frontend

- `TerminalTab` (aba "Terminal" do detalhe da app): `@xterm/xterm` + `@xterm/addon-fit`.
  Conecta o `WebSocket` nativo a `VITE_TERMINAL_WS_URL` (ou derivado de `VITE_API_URL`
  com porta+1), envia keystrokes (`term.onData`) e resize (`ResizeObserver`+`onResize`).

## Verificação (k3d real)

Abrir a aba Terminal → rodar `ls`/`env` no pod e ver a saída ao vivo; redimensionar a
janela reflete `$COLUMNS/$LINES` no shell.

## Observações

- Exige um pod Running (apps paradas/0 réplicas não têm onde exec).
- A porta dedicada precisa ser alcançável pelo browser (em dev, `localhost:3001`);
  em produção, expor/proxiar `wss://…` para o `TERMINAL_WS_PORT`.
