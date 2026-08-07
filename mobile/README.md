# Capiva Cloud Mobile

App móvel (Expo Go) para monitorar, anexar e executar comandos na sua instância do Capiva Cloud — inclusive self-hosted.

## Funcionalidades

- **Login self-hosted**: informe a URL do seu painel (ex.: `http://10.1.2.8:8410`) na tela de login. A URL fica salva no dispositivo.
- **Visão geral**: contadores (projetos/apps/bancos/workers), saúde da frota, clusters e atividade recente.
- **Aplicações**: lista por projeto, detalhe com status, métricas ao vivo (SSE), ações de ciclo de vida (deploy, restart, start/stop, rollback) e histórico de deploys.
- **Nova aplicação**: criação com deploy inicial automático — imagem Docker ou repositório Git (conexão → repositório → branch), ambiente, perfil, porta, domínio e variáveis de ambiente.
- **Logs ao vivo**: stream SSE dos logs da aplicação.
- **Terminal**: attach interativo no pod da aplicação e shell SSH nos nós do cluster, pelo mesmo gateway WebSocket do painel web (stdin como texto, resize como frame binário).
- **Monitor**: nós do cluster com CPU/memória (metrics-server), pods e alertas.
- **Multi-organização**: troca de organização ativa nos Ajustes.

## Stack

- Expo SDK 57 + expo-router (compatível com Expo Go)
- NativeWind v4 (paleta idêntica ao painel web, dark por padrão)
- Componentes [React Native Reusables](https://reactnativereusables.com/) em `src/components/ui`
- TanStack Query + Zustand (mesmos padrões do frontend web)
- SSE via `XMLHttpRequest` incremental (`src/lib/sse.ts`) — RN não tem `EventSource`
- WebSocket nativo para o terminal (`src/lib/terminal.ts`)

## Rodando

```bash
cd mobile
bun install
bun run start        # abre o Metro; escaneie o QR com o Expo Go
```

No login, use a URL do painel — a mesma que você abre no navegador (ex.: `http://10.1.2.8:8410`). O nginx do painel faz proxy de `/api` e `/terminal`, então uma única URL serve para tudo. Apontar direto para a API (`:8411` ou o backend dev em `:3000`) funciona para REST/SSE, mas o terminal WebSocket só conecta pela origem do painel (ou pela porta dedicada `TERMINAL_WS_PORT`, `PORT+1` em dev).

> 💡 **Expo Go fecha ao carregar o bundle?** Atualize o Expo Go pela loja — o app usa o SDK 57 e versões antigas do Expo Go derrubam o processo sem mensagem. O projeto roda no emulador/dispositivo com Expo Go atualizado.
>
> ⚠️ Instâncias em `http://` (sem TLS) funcionam no Expo Go em rede local. Para builds standalone (EAS), habilite cleartext (`usesCleartextTraffic`/ATS) ou sirva o painel via HTTPS.

## Estrutura

```text
src/
├── app/            # rotas (expo-router): login, (tabs), apps/[id], nodes/[id]
├── components/     # Screen, TerminalView, LogViewer, StatusBadge, MetricBar…
│   └── ui/         # componentes React Native Reusables (shadcn-style)
├── hooks/          # useApplications, useMonitoring, useLogsStream… (React Query)
├── lib/            # api client, SSE, terminal, tema, query client
└── stores/         # useAuthStore (serverUrl + sessão), useWorkspaceStore
```

## Autenticação

Espelha o painel web: access token RS256 em memória + refresh via cookie HttpOnly (gerenciado pelo runtime nativo). Em `401` o client tenta um refresh transparente e refaz a request. Streams (SSE/WS) autenticam por `?access_token=&org=`, igual ao painel.
