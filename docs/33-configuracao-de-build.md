# 33 — Configuração de build (Dockerfile, monorepo e CD)

Controle de build no nível que ferramentas como o Dokploy oferecem: dizer **qual**
Dockerfile usar, **de onde** buildar num monorepo e **quando** um push deve virar deploy.

## O que mudou

Antes, o wizard oferecia quatro nomes de Dockerfile numa lista de rádio fixa
(`Dockerfile`, `Dockerfile.prod`, `Dockerfile.api`, `Dockerfile.worker`). Repositório com
`docker/Dockerfile.prod` ou `apps/api/Dockerfile` simplesmente não tinha como ser
configurado pela interface — e, uma vez criada, a aplicação não permitia mudar o build.

Agora:

| Campo | Onde | Efeito |
|---|---|---|
| `dockerfile` | Wizard (passo Build) e Configurações | Caminho do Dockerfile, **digitável**. Os quatro nomes viraram atalhos. |
| `subPath` | Wizard (passo Build) e Configurações | Subpasta usada como raiz do build (monorepo). Vazio = raiz do repositório. |
| `compose` | Wizard (passo Build) | Caminho do arquivo docker-compose. |
| `autoDeploy` | Configurações | Liga/desliga o deploy automático por push. |
| `watchPaths` | Configurações | Restringe o disparo a caminhos do monorepo. |

O `subPath` já era lido pelo builder (`contextSubPath` do Job Kaniko), mas nenhuma tela
ou schema o preenchia — a capacidade existia e estava inacessível.

## Validação de caminho

Os valores vão direto para os argumentos do Job de build, então passam por
`repoPathSchema` (`@schemas/application.schema`):

- caminho **relativo** — barra inicial é recusada;
- sem travessia — nenhum segmento pode ser `..`;
- sem caracteres de controle, máximo 255 caracteres.

Sem isso, `--dockerfile=../../etc/passwd` apontaria o build para fora do contexto clonado.
A regra vale na **criação** (via `superRefine` no `sourceConfig`) e na **edição**. O
frontend replica a checagem em `@/lib/repoPath` só para mostrar o erro no campo — o
servidor continua sendo a autoridade.

String vazia na edição **limpa** o campo (o builder volta ao default) em vez de gravar um
caminho vazio que quebraria o build.

> `repoPathSchema` não usa `.transform()` de propósito: o documento OpenAPI é gerado por
> `z.toJSONSchema` a partir destes schemas e transforms não são representáveis em JSON
> Schema — quebrariam a rota `/docs`. Há teste de regressão para isso.

## Como o Kaniko resolve os caminhos

`--dockerfile` é relativo ao contexto de build, e `--context-sub-path` define esse contexto.
Num monorepo com `subPath = apps/api` e `dockerfile = Dockerfile.prod`, o build usa
`apps/api/` como raiz e `apps/api/Dockerfile.prod` como receita.

## Deploy automático e caminhos observados

O webhook Git dispara deploy nas aplicações da conexão cuja branch corresponde ao push.
Dois controles novos:

- **`autoDeploy`** — ligado por padrão (comportamento anterior preservado). Desligado, o
  push é ignorado e o deploy passa a ser só manual, útil para produção com promoção controlada.
- **`watchPaths`** — lista de prefixos. Com ela, o deploy só dispara se o push tocou algum
  arquivo sob um dos caminhos. Num monorepo, evita reconstruir todos os serviços a cada commit.

Detalhes de comportamento (ver `matchesWatchPaths` em `GitService`):

- comparação por **segmento**: `apps/api` não casa com `apps/api-legacy`;
- barras iniciais/finais são normalizadas (`./apps/api/` ≡ `apps/api`);
- push **sem lista de arquivos** no payload dispara mesmo assim — os provedores truncam a
  lista em pushes grandes, e perder um deploy é pior do que rodar um build a mais.

## Endpoints

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/api/applications` | `sourceConfig.dockerfile` / `.subPath` / `.compose` validados. |
| `PATCH` | `/api/applications/:id` | `dockerfile`, `subPath`, `compose`, `autoDeploy`, `watchPaths`. |

Ambos documentados no OpenAPI (`/docs`), junto com o header obrigatório
`x-organization-id`. Mudanças de build valem a partir do **próximo deploy** — a aplicação
não é reconstruída ao salvar.
