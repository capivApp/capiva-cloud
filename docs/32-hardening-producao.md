# 32 — Hardening de produção

Registro da varredura de prontidão para produção: o que estava aberto, o que mudou e
o que **ainda depende de ação do operador**.

---

## 🔴 Ação obrigatória antes de ir para produção

### 1. Rotacionar o par de chaves JWT (chave vazada)

`backend/src/keys/private.key` esteve **versionado no repositório** (commit `7d72d10`,
"open source code to public"). Quem clonou o repo tem a chave privada que assina os
access tokens e consegue forjar um token válido para qualquer usuário.

Remover o arquivo do índice **não** o remove do histórico. É preciso:

```bash
# 1. Gerar um par novo
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out jwt.key
openssl rsa -in jwt.key -pubout -out jwt.pub

# 2. Publicar como secret (JWT_PRIVATE_KEY / JWT_PUBLIC_KEY ou *_FILE)

# 3. Expurgar do histórico do Git e forçar o push
git filter-repo --path backend/src/keys/private.key --path backend/src/keys/public.key --invert-paths
```

Trocar a chave invalida todas as sessões existentes — os usuários refazem login.

### 2. Trocar `ENCRYPTION_KEY`

O default `change-me-32-bytes-key-000000000000` é público. Ele cifra kubeconfigs,
tokens Git, credenciais SSH de nós e senhas de banco. O backend agora **recusa subir**
em produção com esse valor (`assertProductionSecrets`).

Se a plataforma já rodou com o default, os dados cifrados precisam ser **re-cifrados**
com a chave nova (ou recadastrados), pois foram gravados com uma chave conhecida.

---

## Isolamento multi-tenant

O `x-organization-id` era um texto escolhido pelo cliente e os repositórios buscavam
por id sem filtro de organização. Três consequências:

- qualquer usuário autenticado lia recursos de qualquer organização (51 das 52 rotas
  `GET` não passavam por `requireRole`);
- passando a própria org no header, mutações atingiam recursos de outra org;
- o WebSocket do terminal aceitava `?org=` sem checar associação — **shell em pod e
  SSH root em nó de qualquer organização**.

O que mudou:

| Camada | Correção |
|---|---|
| Dados | `@database/tenantScope` declara como cada modelo chega à organização; toda busca por id compõe esse filtro (`findFirst`), e `update`/`delete` passam por uma leitura escopada. |
| Criação | `assertParents` valida `projectId`/`environmentId`/`applicationId` do corpo da requisição antes de inserir. |
| HTTP | `authMiddleware` valida a associação do usuário à organização pedida e publica `req.organizationRole`. |
| RBAC | `requireRole` compara o papel já validado (sem consulta extra). |
| Terminal | O gateway exige papel `DEVELOPER` na organização antes do upgrade para WebSocket. |

`tenantScope` **falha alto** quando não há organização no contexto — um escopo
silenciosamente vazio devolveria a plataforma inteira.

> Backups de **volume** são a exceção: `Backup.volumeId` não tem relação no schema,
> então a posse é estabelecida no `VolumeBackupService`, que resolve o Volume escopado
> antes de tocar no backup.

---

## Alta disponibilidade

### Control plane

- **Encerramento gracioso**: só havia handler de `SIGINT`. Kubernetes e Docker enviam
  `SIGTERM` — todo rollout cortava requisições em voo. Agora `SIGTERM`/`SIGINT` param os
  timers, drenam o HTTP (`SHUTDOWN_GRACE_MS`, default 15s) e liberam as leases.
- **Leader election** (`platform_locks`): os schedulers de uptime e de backup rodavam em
  **todas** as réplicas. Com 3 réplicas eram 3 dumps do mesmo banco e 3× o tráfego de
  sondagem. A lease no banco garante um executor por vez e expira sozinha se o líder cair.
- **Readiness separada de liveness**: `/health` não toca o banco (senão uma instabilidade
  do Postgres faria o Kubernetes matar todas as réplicas); `/ready` verifica a conexão.

### Workloads do usuário

A doc [10 — Alta Disponibilidade](./10-alta-disponibilidade-multicluster.md) prometia
PodDisruptionBudget, topologySpreadConstraints e probes de liveness. Nenhum dos três era
gerado. Agora são:

| Recurso | Comportamento |
|---|---|
| `PodDisruptionBudget` | `maxUnavailable: 1` — drain de nó e upgrade de cluster não derrubam todas as réplicas. |
| `topologySpreadConstraints` | Espalha entre nós e zonas com `ScheduleAnyway` (cluster de nó único continua funcionando). |
| `livenessProbe` | Reinicia processo travado. Limiares mais frouxos que a readiness — falso positivo aqui mata o container. |
| `strategy` | `maxUnavailable: 0` + `minReadySeconds: 10` — zero-downtime de verdade (o default do Kubernetes derruba 25%). |
| `terminationGracePeriodSeconds` | 30s para o processo encerrar o que está em voo. |

### Correções de comportamento

- **Rollout sem paridade**: Blue/Green e Canary montavam um container mínimo — trocar a
  estratégia fazia a app **perder volumes persistentes e o pull secret** do registry
  privado. O pod spec agora é compartilhado com o Deployment.
- **Laço infinito no canary**: `increment: 0` na configuração travava o processo do
  backend ao montar os passos. Os valores são normalizados.
- **AnalysisTemplate sem dado**: a query filtrava por `app="<nome>"`, label que nenhum
  recurso gerado aplica. Passa a usar `service`+`namespace` (configurável por
  `CAPIVA_ANALYSIS_SELECTOR`) e `or vector(0)` para não travar app sem tráfego.
- **Redis em HA inutilizável**: `REDIS_URL` apontava para `rfs-<n>:26379`, o Service do
  **Sentinel** — cliente comum nunca conecta. Passa a apontar para `rfr-<n>:6379`, com o
  Sentinel exposto em `REDIS_SENTINEL_URL`.
- **MinIO**: host fixo `minio` apontava para o tenant errado com mais de um na plataforma.
- **`destroy` incompleto**: deixava para trás Rollout, AnalysisTemplate, PDB, PVCs e os
  Ingress/Secret dos domínios adicionais — recursos órfãos consumindo storage.
- **CronJob**: sem `concurrencyPolicy`, um job mais lento que o intervalo acumulava
  réplicas até esgotar o nó. Agora `Forbid` + `startingDeadlineSeconds` + limites de histórico.
- **Build Kaniko**: sem `resources` nem `activeDeadlineSeconds`, um build travado segurava
  o nó indefinidamente.

---

## Superfície HTTP

| Item | Antes | Agora |
|---|---|---|
| TLS | `NODE_TLS_REJECT_UNAUTHORIZED=0` **global por default** — expunha Git, S3, webhooks e notificações a MITM. | Escopado às chamadas do API server via `CAPIVA_K8S_INSECURE_TLS=true` (opt-in). |
| CORS | Lista fixa em `localhost`, no código. | `ORIGIN_WHITELIST` (vazio em produção: painel e API na mesma origem). |
| Rate limit | Nenhum. | `authRateLimit` em login/registro/refresh, `apiRateLimit` geral. |
| Cabeçalhos | Nenhum. | `securityHeaders` (nosniff, frame-ancestors, CSP, HSTS atrás de TLS). |
| Proxy | `req.ip` era o IP do nginx. | `trust proxy` (`TRUST_PROXY_HOPS`) — sem isso o rate limit por IP vira balde único. |
| Container | Rodava como **root**. | Usuário `bun` sem privilégios + `HEALTHCHECK`. |

> O rate limit é **por processo**: com N réplicas o teto efetivo é N × `max`. Para limite
> global exato, aplicar no edge (Traefik/WAF).

---

## Variáveis novas

| Variável | Default | Descrição |
|---|---|---|
| `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` | — | PEM do par RS256. **Obrigatório em produção.** |
| `JWT_PRIVATE_KEY_FILE` / `JWT_PUBLIC_KEY_FILE` | — | Alternativa por secret montado em volume. |
| `ORIGIN_WHITELIST` | vazio em prod | Origens de CORS, separadas por vírgula. |
| `CAPIVA_K8S_INSECURE_TLS` | `false` | Aceita cert self-signed **apenas** no API server. |
| `AUTH_RATE_LIMIT_MAX` | `10` | Tentativas de credencial por IP+e-mail / 15 min. |
| `API_RATE_LIMIT_MAX` | `600` | Requisições por IP / minuto. |
| `SHUTDOWN_GRACE_MS` | `15000` | Janela de drenagem no `SIGTERM`. |
| `TRUST_PROXY_HOPS` | `1` | Saltos de proxy confiáveis. |
| `CAPIVA_ANALYSIS_SELECTOR` | `service="{{name}}",namespace="{{namespace}}"` | Seletor Prometheus da análise de rollout. |
| `CAPIVA_BUILD_TIMEOUT_SECONDS` | `1800` | Teto de duração do Job de build. |
| `CAPIVA_BUILD_CPU_LIMIT` / `CAPIVA_BUILD_MEMORY_LIMIT` | `2` / `4Gi` | Teto de recursos do build. |

---

## Pendências conhecidas

Fora do escopo desta rodada, mas necessárias para produção:

1. **RLS no Postgres.** `withTransaction` tem o ponto de extensão comentado. O escopo por
   organização hoje é de aplicação — RLS traria defesa em profundidade no banco.
2. **`Backup.volumeId` sem relação no schema.** Impede escopo declarativo; exige a migração
   que adiciona a FK.
3. **Migrations no `CMD`.** Com mais de uma réplica, mover `prisma migrate deploy` para um
   job/init container único do rollout.
4. **Multi-cluster: geo-redundância e Velero.** A doc 10 descreve DNS global com failover
   por saúde e snapshots cross-cluster; nada disso existe no código.
5. **Rate limit distribuído** e auditoria de tentativas de acesso cross-tenant.
