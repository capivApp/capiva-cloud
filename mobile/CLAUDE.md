# Capiva Cloud Mobile — instruções do projeto

App Expo (SDK 57, compatível com Expo Go) que consome a API do backend em `../backend`.

## Padrões obrigatórios

- **Aliases sempre**: `@/*` → `src/*` (tsconfig). Nunca imports relativos entre pastas.
- **UI**: componentes de `src/components/ui` são do [React Native Reusables](https://reactnativereusables.com/) — adicione novos com `bunx @react-native-reusables/cli@latest add <componente>`; não crie duplicatas.
- **Estilo**: NativeWind (className). Nada de `StyleSheet.create` ou estilo inline, exceto valores dinâmicos (insets, dimensões) e chrome nativo (tab bar/header usam `src/lib/theme.ts`).
- **Dados**: todo request via `src/lib/api.ts` + React Query em hooks (`src/hooks/useX.ts`) expondo `{ data, isLoading, refetch… }`. Nunca `fetch` direto em tela, nunca `useEffect` para carregar dados.
- **Tempo real**: SSE via `src/lib/sse.ts` (RN não tem EventSource); terminal via WebSocket nativo (`src/lib/terminal.ts`). Métricas/logs ao vivo NUNCA por polling.
- **Estado global**: zustand (`src/stores`). `useAuthStore` persiste `serverUrl`/`organizationId`/`user` em AsyncStorage; o access token fica só em memória (refresh via cookie nativo).
- **Condicionais**: strategy maps e early return (ver `StatusBadge`, `TerminalView`); evitamos if/else encadeado.

## Contratos com o backend

- REST em `{serverUrl}/api/*` com `Authorization: Bearer` + header `x-organization-id`.
- SSE em `/api/streams/*` e WS em `/terminal/{applications|nodes}/:id`, ambos autenticados por query `?access_token=&org=` (EventSource/WS não enviam headers).
- No deploy, o nginx do painel faz proxy de `/api` e `/terminal` na mesma origem — por isso a URL informada no login é a do painel.
- Tipos das respostas espelham os hooks do frontend web (`../frontend/src/hooks`); em dúvida, confira lá e nos controllers de `../backend/src/controller`.

## Validação

```bash
bun run typecheck
```
