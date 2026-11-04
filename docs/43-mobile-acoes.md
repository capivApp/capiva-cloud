# 43. App mobile que age: redeploy, rollback, réplicas, restart e push

Antes o app só listava, monitorava, mostrava logs e abria terminal. A tela da aplicação
(`mobile/src/app/apps/[id]/index.tsx`) agora também opera a aplicação. Nenhum endpoint novo
foi necessário: tudo já existia em `/api/applications/:id`.

## Ações e endpoints

| Ação na tela            | Endpoint                                  | Observação |
|-------------------------|-------------------------------------------|------------|
| Redeploy                | `POST /deploy`                            | Rebuild do último commit da branch ou nova publicação da imagem. Devolve o `Deployment` (202). |
| Voltar para esta versão | `POST /rollback` `{ deploymentId }`       | Lista só deploys `HEALTHY` com `imageRef`, sem o que está no ar. |
| Réplicas (fixo)         | `POST /scaling/replicas` `{ replicas }`   | Stepper de 0 a 100 (mesmo limite do `scaleReplicasSchema`). |
| Réplicas (autoscaling)  | `PUT /scaling`                            | Edita mínimo e máximo; métrica e alvo da política atual são preservados. |
| Reiniciar pods          | `POST /restart`                           | Rollout restart (annotation `capiva.cloud/restartedAt`). |
| Parar / Iniciar         | `POST /stop`, `POST /start`               | Já existia; o botão agora lê `desiredStatus` em minúsculas, como o backend grava. |

Toda ação com impacto pede confirmação (`confirmAndRun` em `src/lib/alerts.ts`) e mostra o
erro do servidor num alerta em vez de deixar a promessa rejeitar em silêncio.

Antes desta mudança, o botão Rollback do app chamava `POST /rollback` sem `deploymentId`
e recebia 400 sempre.

## Tempo real

- **Deploy em andamento**: `findDeploymentAtivo` olha só o deploy mais recente (um deploy antigo
  travado em `QUEUED` não prende a tela). O card segue `GET /api/streams/deployments/:id`
  (evento `progress`) via `useDeploymentProgress`; ao chegar `done`, invalida a aplicação.
- **Réplicas**: `useScaling` lê `GET /api/streams/applications/:id/scaling` (evento `scaling`).
  Com `policy` presente a tela edita mínimo e máximo do HPA; sem política, réplicas fixas.

## Papel do usuário

`useMyRole` resolve o papel pela lista de membros (`GET /members`, aberta a VIEWER) e pelo
`user.id` do `useAuthStore`. `buildPermissoesDaAplicacao` (`src/lib/permissions.ts`) espelha o
RBAC das rotas: toda mutação exige DEVELOPER ou superior. VIEWER vê os dados, os steppers
desabilitados e nenhum botão de ação. Papel ainda não carregado bloqueia tudo. Quem garante é
o backend (`requireRole("DEVELOPER")`, coberto por `rbac.applicationActions.test.ts`).

## Push com deep link

- Backend: `NotificationMessage` ganhou `data?: Record<string, string>`. O adapter PUSH manda
  `data: { ...m.data, event }` para a Expo. `deploy.succeeded` e `deploy.failed` levam
  `applicationId` e `deploymentId`.
- Mobile: `expo-notifications` instalado. `useNotificationRedirect` (layout raiz) trata o toque
  (`addNotificationResponseReceivedListener` + `getLastNotificationResponse` para o cold start)
  e abre `/apps/[id]` via `buildNotificationHref`. Sem sessão ainda, a rota fica em
  `useNotificationStore` e as tabs a abrem depois do gate de login
  (`usePendingNotificationHref`). O mesmo toque não é tratado duas vezes (`handledId`).
- O token Expo do aparelho continua sendo informado no canal PUSH (`config.expoTokens`).
  O registro automático do token pelo app não faz parte desta entrega.

## Testes

```bash
cd mobile && bun run test        # regras puras: permissões, stepper, deploys, deep link
cd backend && bun test           # adapter PUSH com data + RBAC das ações
```

Os testes do mobile usam `bun test` em funções puras (`src/lib/*`), sem framework de UI.
