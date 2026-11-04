# 37. Preview deployments por pull request

Ambiente efêmero por PR (GitHub/Gitea) ou MR (GitLab). Abrir o PR cria uma cópia da
aplicação na branch do PR em `pr-<n>-<app>.<CAPIVA_PREVIEW_DOMAIN>`; novo push no PR
redeploya; fechar ou dar merge destrói tudo (recursos no cluster e linhas no banco).

## Fluxo

```
webhook PR/MR ─► GitService (parsing, outro módulo) ─► gitEvents.emitPullRequest(event)
                                                         │
bootstrap/previewDeployments.ts ── gitEvents.onPullRequest
                                                         ▼
                              PreviewDeploymentService.handlePullRequest(event)
                                ├─ createPreviewActionStrategy(event.action)
                                ├─ apps da conexão  ─► strategy.isOrigemElegivel
                                └─ strategy.apply(origem, event, operações)
```

- `@infra/realtime/GitEventBus`: barramento em memória (`PullRequestEvent` normalizado).
  O webhook chega a uma réplica e só ela reage, então o handler não usa liderança.
- `@service/preview/previewAction.strategy`: uma strategy por ação.

| Ação                     | Strategy   | O que faz |
|--------------------------|------------|-----------|
| `opened`, `reopened`     | Create     | Cria o preview (ou reaproveita, em webhook reentregue), dispara o deploy com o sha do head e avisa o PR com a URL. Criação recusada (ex.: cota do ambiente, 422) avisa o PR com o motivo (`notifyFailure`) e o erro segue para o log; não há deploy. |
| `synchronized`           | Redeploy   | Regrava os metadados do PR (sha) e dispara o deploy. Sem preview (previews ligados com o PR já aberto), cai no Create. Não avisa de novo. |
| `closed`, `merged`       | Destroy    | `ApplicationService.remove` (cluster + banco), ressincroniza a NetworkPolicy dos ambientes de que o preview dependia e avisa o PR com `null`. |

## Elegibilidade (`@service/preview/previewEligibility`)

- Criar/redeployar: aplicação com `sourceConfig.previews.enabled = true` (default `false`),
  da mesma conexão Git do evento, do mesmo repositório (`sourceConfig.repo` ou `fullName`;
  sem repo gravado, a conexão basta, como no push) e cuja branch de deploy
  (`sourceConfig.branch`, default `main`) é a `targetBranch` do PR.
- Destruir: basta ser do repositório. O toggle e a branch alvo são ignorados, para que
  desligar os previews com PR aberto não deixe preview órfão.
- Aplicação que já é preview nunca é origem.

## A cópia (`@service/preview/previewInput`)

- **Mesmo projeto e mesmo ambiente** da origem (decisão): `Environment` é cluster +
  namespace. Um ambiente de preview exigiria namespace novo, quotas, NetworkPolicy e
  acesso aos bancos do ambiente original; o prefixo `pr-<n>-` já evita colisão de nomes
  no namespace e o preview reaproveita build, reconcile, domínio e TLS sem caminho
  paralelo.
- Nome `pr-<n>-<app>`, truncado em 63 caracteres (nome de recurso e rótulo DNS).
- Branch = `sourceBranch` do PR. `autoDeploy: false`: quem redeploya é o evento
  `synchronized`; com o push ligado, cada push na branch do PR geraria dois deploys.
- Perfil `NANO`, rollout `ROLLING`, **1 réplica** (`ApplicationService.reconcile` usa 1
  réplica por padrão quando `previewOfId` está preenchido), sem HPA (a `ScalingPolicy`
  não é copiada).
- Campos do `sourceConfig` da origem que **não** vão para o preview: `domain`, `previews`,
  `buildArgs` (remontados), `replicas` (a cota contou NANO com 1 réplica; herdar as
  réplicas furava a cota), `capivaJson` (marcador do último deploy da ORIGEM),
  `deployTrigger` e `tagPattern` (sem efeito com o deploy por push desligado).
- Variáveis copiadas linha a linha, preservando `secret` (valor continua cifrado), a
  origem (`MANUAL`/`INJECTED`/`EXTERNAL`) e, nas `EXTERNAL`, o cofre (`secretStoreId`) e
  a `remoteProperty`: sem o cofre o `containerEnv` descartaria a variável e o preview
  subiria sem o segredo. Build args copiados. Tags da origem + `preview`.
- Dependências (`ServiceDependency`) em que a origem é a ponta de origem são copiadas
  para o preview (mesmo destino, mesmas `injectedKeys`), e a NetworkPolicy de cada
  ambiente de destino é ressincronizada: com isolamento de rede, dependência em outro
  ambiente só liberava o nome da origem. Na remoção (PR fechado, tela ou TTL) o cascade
  apaga as arestas e a NetworkPolicy desses ambientes é ressincronizada.
- O deploy leva `origin: { commitSha: headSha }`, então reporta o status do commit no PR.
- Domínio `pr-<n>-<app>.<CAPIVA_PREVIEW_DOMAIN>`. TLS segue a origem; certificado
  enviado (`UPLOADED`) cobre o domínio da origem, não o do preview, então vira
  Let's Encrypt. Origem sem TLS continua sem TLS.
- Volumes, uptime checks, domínios da origem e dependências em que a origem é o
  DESTINO **não** são copiados.
- Metadados do PR em `sourceConfig.preview` (`number`, `title`, `sourceBranch`,
  `targetBranch`, `headSha`, `author`, `url`).

## Banco do preview

Opção por aplicação, `sourceConfig.previews.database` (`PATCH /applications/:id` com
`previewsDatabase`, ou o seletor "Banco do preview" em Configurações):

| Modo | Padrão | O que acontece |
|------|--------|----------------|
| `copy` | sim | Cada banco gerenciado que a origem usa ganha um clone `pr-<n>-<banco>` no mesmo ambiente, e o preview passa a apontar para ele. |
| `shared` | não | O preview usa os mesmos bancos da origem (comportamento antigo). A tela avisa que os dados reais podem ser alterados. |

Como a cópia funciona (`@service/preview/PreviewDatabaseCloner`):

- **Quais bancos.** O `attach` não grava vínculo, só injeta a conexão como variável
  `INJECTED`. O clonador decifra essas variáveis da origem e compara o host com o host
  interno de cada banco do projeto (`internalHostOf`, a mesma função que monta a URL).
  A comparação é por igualdade, então `mydb` não casa com `db`. Clones de outros previews
  nunca são clonados.
- **Dados.** PostgreSQL e MySQL recebem o último backup concluído de um banco só
  (`.sql.gz`), pelo restore como cópia (`DatabaseRestoreService.requestRestore`, modo
  `AS_COPY`). Sem backup, ou em tipo sem dump lógico (Redis, RabbitMQ, Kafka e afins),
  o clone sobe vazio (`createCopyOf`).
- **Ordem.** O deploy do preview só sai depois que a cópia termina (polling do restore até
  `CAPIVA_PREVIEW_RESTORE_TIMEOUT_SECONDS`, padrão 900). A migration do boot roda sobre os
  dados copiados, e não disputa com o restore.
- **Ligação.** O clone é marcado com `ManagedDatabase.previewOfApplicationId` e ligado ao
  preview com `attachToApplication`, que sobrescreve a variável copiada da origem.
- **Avisos.** Banco que subiu vazio, cópia que falhou ou que passou do prazo vão como
  linhas no comentário do PR (`sourceConfig.previewDatabase.notes`).
- **Falha.** Se a clonagem falhar (quota do ambiente, por exemplo), o preview é desfeito
  e o PR recebe o motivo. Um preview sem a cópia subiria apontando para produção.
- **Remoção.** Fechar o PR, destruir pela tela ou expirar por TTL destrói os clones. O
  scheduler de limpeza também destrói clones órfãos, cujo preview sumiu quando a origem
  foi removida. Por isso a coluna não tem FK: o registro sobrevive à aplicação.

Migration `20261104140000_preview_database_clones`.

## Banco de dados

- `Application.previewOfId` (FK para a origem, `ON DELETE CASCADE`) +
  `Application.previewPrNumber`, únicos juntos (um preview por aplicação e PR).
  Migration `20261104120000_application_previews`.
- `GET /applications/:id` (o `getById`) inclui `previews` (com `domains`) e, no preview,
  `previewOf`. A lista de aplicações devolve `previewOfId`/`previewPrNumber` para a marca
  de preview.
- `ApplicationService.remove` remove os previews antes da origem: o cascade do banco
  apagaria as linhas e deixaria os recursos deles no cluster.

## Limpeza por TTL

`@infra/scheduler/previewCleanupScheduler` (a cada hora, com `withLeadership`, lease
`scheduler:preview-cleanup`) chama `PreviewDeploymentService.destroyExpired`, que destrói
previews com `updatedAt` mais antigo que `CAPIVA_PREVIEW_TTL_DAYS` (default 7). Todo
evento do PR regrava o preview e todo deploy atualiza o status, então `updatedAt` mede a
atividade.

## Aviso no PR

Porta `PreviewNotifier` (`@service/preview/PreviewNotifier`), com implementação no-op por
padrão. A classe é o token de DI. O boot (`@bootstrap/previewDeployments`) registra o
`GitCommentPreviewNotifier`, que comenta no PR/MR pelo `GitService.commentOnPullRequest`
(upsert pelo marcador `<!-- capiva-preview -->`, best-effort):

```ts
container.register(PreviewNotifier, container.get(GitCommentPreviewNotifier));
```

O service é resolvido a cada evento, então o registro só precisa acontecer antes do
primeiro PR. Falha no aviso é logada e não interrompe o preview.

## API

| Método | Rota                                       | Descrição |
|--------|--------------------------------------------|-----------|
| PATCH  | `/applications/:id` `{ previewsEnabled }`  | Liga/desliga os previews (`sourceConfig.previews.enabled`). |
| GET    | `/applications/:id`                        | Inclui `previews`. |
| DELETE | `/applications/:id/previews/:previewId`    | Destrói um preview pela tela (`DEVELOPER+`). Um novo push no PR recria. |

## Frontend

- Configurações da aplicação: toggle "Ambientes de preview por PR" (só para aplicação
  com conexão Git que não é preview).
- Aba **Previews** no detalhe: PR, branch, URL, status e botão Destruir
  (`usePreviewDeployments`).
- Marca "Preview PR #n" no card da lista de aplicações e no cabeçalho do detalhe, com
  link para a origem.

## Variáveis de ambiente

`CAPIVA_PREVIEW_DOMAIN` e `CAPIVA_PREVIEW_TTL_DAYS`: ver
[20-variaveis-de-ambiente.md](20-variaveis-de-ambiente.md).

## Pendências

- O clone recebe o último backup concluído, que pode ter até um dia de atraso em relação
  à produção. Dump na hora (dados atuais) não existe.
- Aguardar a cópia segura o webhook do PR até `CAPIVA_PREVIEW_RESTORE_TIMEOUT_SECONDS`.
  Se passar do prazo, o deploy sai assim mesmo e o PR é avisado.
- Remover a ORIGEM remove os previews por `ApplicationService.remove`, que não
  ressincroniza a NetworkPolicy dos ambientes de destino das dependências do preview:
  a liberação pelo nome do preview fica até o próximo sync daquele ambiente.
- Destruir por TTL não avisa o PR (o scheduler não tem o evento).
- Barramento em memória: com várias réplicas, segue valendo porque o webhook chega a uma
  só. Trocar por Redis pub/sub mantém a interface.
