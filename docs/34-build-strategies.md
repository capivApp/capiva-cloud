# 34 — Estratégias de build por origem

Até aqui toda origem por código (GitHub, GitLab, Gitea, Docker Compose, Nixpacks,
Railpack, Buildpacks, Static) virava o mesmo Job Kaniko, que só funciona com Dockerfile
no repositório. "Nixpacks" num repositório sem Dockerfile falhava. Agora cada origem tem
a sua Strategy e o seu Job.

## Arquitetura

| Peça | Arquivo | Papel |
|---|---|---|
| `BuildStrategyResolver` | `@infra/build/strategies` | Factory: indexa as strategies por `sources` e devolve a da origem. Origem desconhecida lança `BuildConfigError`. |
| Strategies | `@infra/build/strategies` | Uma classe por origem. Declaram as origens que atendem e o plano do Job (manifest + container onde ler a falha de clone). |
| `BuildJobRunner` | `@infra/build/BuildJobRunner` | Comum a todas: secrets efêmeros de push e de clone, aplica o Job, espera, retenta o clone com o outro protocolo e remove os secrets no fim. |
| Manifests | `@infra/kubernetes/buildManifests` | Funções puras `BuildJobInput -> Job`, uma por origem. |
| Compose | `@infra/build/composePlanScript` | Script do initContainer que resolve o serviço do compose. |

Origem nova = uma função de manifest, uma classe de poucas linhas e uma linha em
`createBuildStrategies`. Nada existente muda.

O `IBuildStrategy` trocou `supports(source)` por `readonly sources: string[]`: o resolver
monta um `Map` em vez de percorrer uma lista com condicional.

### Desenho comum das origens sem Dockerfile

Um `emptyDir` montado em `/workspace`:

1. initContainer `clone` (`alpine/git`) clona `--depth 1` a branch em `/workspace/src`;
2. initContainer(s) da origem geram o que falta (Dockerfile, plano, ambiente);
3. o container principal constrói e publica.

Credenciais e fallback preservados:

- **Clone privado**: o secret efêmero `GIT_USERNAME`/`GIT_PASSWORD` entra por `envFrom` e
  um `credential.helper` lê do ambiente. A senha nunca aparece na URL nem nos argumentos.
- **Fallback de protocolo**: a URL do `clone` usa o protocolo da tentativa (o da URL
  primeiro, depois o outro). Se o Job falha, o runner lê o log do container `clone`
  (no Kaniko puro, o do próprio Kaniko) e só retenta quando o erro é de conexão.
- **Push**: o secret `dockerconfigjson` efêmero é montado onde cada builder procura
  (`/kaniko/.docker`, `/home/user/.docker`, `DOCKER_CONFIG=/cnb-docker`).

## Por origem

| Origem | Job | Container principal |
|---|---|---|
| GitHub, GitLab, Gitea | Kaniko puro, contexto `git://` (como antes) | `kaniko` |
| Nixpacks | `clone` → `nixpacks` | `kaniko` |
| Static | `clone` → `static-build` (opcional) → `static-dockerfile` | `kaniko` |
| Docker Compose | `clone` → `compose-plan` | `kaniko` |
| Railpack | `clone` → `railpack-prepare` | `buildkit` (rootless, daemonless) |
| Buildpacks | `clone` → `platform-env` (se houver build args) | `creator` (lifecycle CNB) |

### Nixpacks

`nixpacks build . --out .` na raiz do build (`subPath`) grava `.nixpacks/Dockerfile`, e o
Kaniko constrói com `--context=dir:///workspace/src/<subPath>`. Chaves opcionais do
`sourceConfig`: `installCommand`, `buildCommand`, `startCommand` (viram `--install-cmd`,
`--build-cmd`, `--start-cmd`). Build args vão como `--env` para o plano e como
`--build-arg` para o Kaniko.

Não há imagem oficial com a CLI do Nixpacks: o default (`alpine:3.20`) instala pelo
`install.sh` a cada build. Em cluster sem internet ou para fixar versão, aponte
`CAPIVA_NIXPACKS_IMAGE` para uma imagem que já tenha o binário (o script pula a instalação).
O Kaniko ignora os `RUN --mount=type=cache` que o Nixpacks gera: o build funciona, sem cache.

### Railpack

O Railpack não gera Dockerfile: produz um plano (`railpack-plan.json`) que só o frontend
BuildKit do Railpack entende. Kaniko não serve. A abordagem escolhida:

- `railpack prepare . --plan-out /workspace/plan/railpack-plan.json` no initContainer;
- container `moby/buildkit:rootless` rodando `buildctl-daemonless.sh build`
  com `--frontend=gateway.v0 --opt source=ghcr.io/railwayapp/railpack-frontend`,
  `--local context=<app>` e `--local dockerfile=/workspace/plan`;
- saída `type=image,name=<imagem>,push=true` (`registry.insecure=true` para registry HTTP).

O BuildKit sobe e morre dentro do próprio Job (daemonless): sem `buildkitd` compartilhado
entre tenants e sem `privileged`. Rootless pede `runAsUser: 1000`, seccomp e AppArmor
`Unconfined` e `BUILDKITD_FLAGS=--oci-worker-no-process-sandbox`. O campo
`appArmorProfile` exige Kubernetes 1.30+. Os perfis `baseline` e `restricted` do Pod
Security recusam seccomp/AppArmor `Unconfined`: num namespace com esses rótulos o Job
não é admitido (hoje o Capiva não rotula namespaces). Nesse caso, use Nixpacks.

Build args viram secrets do BuildKit (`--secret id=KEY,env=CAPIVA_ARG_KEY`), com o valor só
no ambiente do container, mais `build-arg:secrets-hash` para invalidar a camada quando um
valor muda (a CLI faz isso sozinha; com o frontend direto, fazemos nós). Comandos
customizados seguem o próprio Railpack: defina `RAILPACK_BUILD_CMD`,
`RAILPACK_START_CMD` etc. como build args.

A versão do frontend deveria ser a mesma da CLI que gerou o plano: fixe as duas com
`CAPIVA_RAILPACK_IMAGE` (imagem com a CLI) e `CAPIVA_RAILPACK_FRONTEND`.

### Buildpacks

Job com o lifecycle `creator` dentro da imagem do builder (`sourceConfig.builder`, default
`paketobuildpacks/builder-jammy-base`, ou `CAPIVA_BUILDPACKS_BUILDER`). Ele detecta,
constrói e publica direto no registry, sem Kaniko:

```
/cnb/lifecycle/creator -app=/workspace/src/<subPath> -layers=/layers -platform=/platform \
  -cache-dir=/cache [-insecure-registry=<host>] <imagem>
```

- `CNB_PLATFORM_API=0.12` (sobrescreva com `CAPIVA_CNB_PLATFORM_API` para builders antigos);
- build args viram `/platform/env/<KEY>`, o canal que os buildpacks leem (ex.: `BP_NODE_VERSION`);
- o builder roda com o usuário do CNB, não root: o `clone` faz `chmod -R a+rwX` no código.

Limite: o `creator` só exporta para registry. Sem registry padrão configurado na
organização o build é recusado com `BuildConfigError` ("Configure um registry padrão para
construir com Buildpacks.").

### Static

Gera um Dockerfile nginx e o Kaniko constrói:

```dockerfile
FROM nginx:1.27-alpine
COPY .capiva/nginx.conf /etc/nginx/conf.d/default.conf
COPY <outputDir>/ /usr/share/nginx/html/
```

| Chave | Default | Efeito |
|---|---|---|
| `buildCommand` | nenhum | Roda com `sh -c` no initContainer `static-build`, com os build args no ambiente. |
| `buildImage` | `node:22-alpine` (`CAPIVA_STATIC_BUILD_IMAGE`) | Imagem do build. |
| `outputDir` | `dist` com build, `.` sem build | Diretório servido. Validado como caminho relativo. |
| `spa` | `false` | `true` faz rotas desconhecidas devolverem o `index.html`. |

O nginx escuta na **porta da aplicação** (`BuildRequest.port`, default 80) e nega arquivos
ocultos (`.git`, `.env`): servir a raiz do repositório exporia o histórico inteiro.
Imagem do nginx: `CAPIVA_STATIC_NGINX_IMAGE`.

### Docker Compose

Decisão: construir **um** serviço do compose, como uma aplicação comum.

- `sourceConfig.compose` (default `docker-compose.yml`, relativo ao `subPath`) e
  `sourceConfig.composeService` (vazio = primeiro serviço com `build`);
- o initContainer `compose-plan` (`oven/bun:1-alpine`, `CAPIVA_BUN_IMAGE`) lê o YAML com
  `Bun.YAML`, resolve `build.context` e `build.dockerfile` (ou `dockerfile_inline`, ou a
  forma curta `build: ./dir`), copia a receita para `/workspace/Dockerfile.compose` e move
  o contexto para `/workspace/context`. O Kaniko tem argumentos fixos, e por isso o script
  normaliza o workspace em vez de o manifest depender do conteúdo do compose;
- contexto ou Dockerfile fora do repositório clonado e contexto remoto (URL Git) são recusados.

Limites (documentados de propósito, não são bugs):

- os outros serviços **não** são criados. Banco, cache e filas viram bancos gerenciados ou
  outras aplicações do projeto;
- `build.args`, `build.target`, `build.secrets` e `build.ssh` do compose são ignorados.
  Use os build args da aplicação;
- `ports`, `environment`, `volumes` do serviço não são importados: porta, variáveis e
  volumes são os da aplicação.

## Configuração (`sourceConfig`)

Validadas na criação (`createApplicationSchema`):

| Chave | Origens | Regra |
|---|---|---|
| `dockerfile`, `subPath`, `compose`, `outputDir` | conforme a tabela acima | caminho relativo, sem `..` |
| `builder` | Buildpacks | referência de imagem |
| `composeService` | Docker Compose | nome de serviço (`[a-zA-Z0-9][a-zA-Z0-9_.-]*`) |
| `installCommand`, `buildCommand`, `startCommand`, `buildImage`, `spa` | Nixpacks / Static | livres |

No wizard, todas as origens por código agora pedem conexão, repositório e branch (antes só
GitHub/GitLab/Gitea pediam, e Nixpacks/Buildpacks/Static ficavam sem repositório). O
passo Build mostra os campos de cada origem (`frontend/src/pages/applications/new/buildOptions.ts`
é a fonte única de quais campos cada origem usa). Railpack entrou na lista de origens.

## Variáveis de ambiente novas

| Variável | Default |
|---|---|
| `CAPIVA_GIT_IMAGE` | `alpine/git:latest` |
| `CAPIVA_NIXPACKS_IMAGE` | `alpine:3.20` (instala a CLI) |
| `CAPIVA_RAILPACK_IMAGE` | `alpine:3.20` (instala a CLI) |
| `CAPIVA_RAILPACK_FRONTEND` | `ghcr.io/railwayapp/railpack-frontend` |
| `CAPIVA_BUILDKIT_IMAGE` | `moby/buildkit:rootless` |
| `CAPIVA_BUILDPACKS_BUILDER` | `paketobuildpacks/builder-jammy-base` |
| `CAPIVA_CNB_PLATFORM_API` | `0.12` |
| `CAPIVA_STATIC_BUILD_IMAGE` | `node:22-alpine` |
| `CAPIVA_STATIC_NGINX_IMAGE` | `nginx:1.27-alpine` |
| `CAPIVA_BUN_IMAGE` | `oven/bun:1-alpine` |

Os limites de CPU/memória e o timeout (`CAPIVA_BUILD_*`) valem para todos os Jobs
(`buildResources` e `buildJobEnvelope` em `manifests.ts`).

## Logs

Os logs crus do build (doc 29) leem o container principal do pod. Nas origens com
initContainers, a saída do `nixpacks`, do `railpack prepare` e do `compose-plan` fica no
initContainer: `kubectl logs <pod> -c <container>`. O runner já lê o `clone` para decidir o
retry de protocolo (`podLogsByLabel` ganhou o parâmetro `container`).

## Testes

- `buildManifests.test.ts`: manifest de cada origem;
- `buildStrategies.test.ts`: resolver, secrets efêmeros, fallback de protocolo, exigência de registry no Buildpacks;
- `composePlan.test.ts`: executa o script do `compose-plan` de verdade num diretório temporário;
- `buildSourceConfig.test.ts`: validação das chaves novas do `sourceConfig`;
- `frontend/.../buildOptions.test.ts`: campos por origem no wizard.

## Atenção: `.gitignore`

A linha `build/` do `.gitignore` da raiz ignorava `backend/src/infra/build/`, e
`strategies.ts` nunca tinha sido versionado (clone novo não compilava). Foi adicionada a
exceção `!backend/src/infra/build/`.
