import { z } from "zod";
import { registerSchema, loginSchema } from "@schemas/auth.schema";
import { createApplicationSchema, scaleReplicasSchema, setScalingSchema, updateApplicationSchema } from "@schemas/application.schema";
import { createAlertRuleSchema, updateAlertRuleSchema } from "@schemas/alert.schema";
import { scanPolicySchema } from "@schemas/scan.schema";
import { LOG_DIRECTIONS, LOG_EXPORT_FORMATS, LOG_LEVELS, LOG_SINCE } from "@interface/logs";
import { LOG_DOWNLOAD_DEFAULT_LINES, LOG_DOWNLOAD_MAX_LINES, LOG_QUERY_MAX_LIMIT } from "@schemas/logs.schema";
import {
  createClusterSchema,
  createDatabaseSchema,
  createEnvironmentSchema,
  createGitConnectionSchema,
} from "@schemas/resource.schema";
import { buildRestorePaths } from "@openapi/restorePaths";
import { setQuotaSchema } from "@schemas/finops.schema";

/**
 * Documento OpenAPI 3.1 gerado a partir dos schemas Zod (fonte da verdade dos
 * contratos). Servido pela UI Scalar em /docs. Evita documentação manual.
 */
function json(schema: z.ZodType): Record<string, unknown> {
  // Zod 4 expõe conversão nativa para JSON Schema.
  return z.toJSONSchema(schema) as Record<string, unknown>;
}

export function buildOpenApiDocument(): Record<string, unknown> {
  const bearer = [{ bearerAuth: [] as string[] }];
  const body = (schema: z.ZodType) => ({
    required: true,
    content: { "application/json": { schema: json(schema) } },
  });

  /**
   * Organização ativa. Toda rota autenticada exige o header: o backend valida
   * que o solicitante é MEMBRO dessa organização e usa o valor para escopar as
   * consultas. Chaves de API dispensam o header (a org vem da própria chave).
   */
  const orgHeader = {
    name: "x-organization-id",
    in: "header",
    required: true,
    schema: { type: "string" },
    description: "Organização ativa. O usuário precisa ser membro; caso contrário 403.",
  };
  const appId = { name: "id", in: "path", required: true, schema: { type: "string" } };
  const ruleId = { name: "ruleId", in: "path", required: true, schema: { type: "string" } };
  const logParams = [
    { name: "q", in: "query", schema: { type: "string", maxLength: 500 }, description: "Linha contém (LogQL `|=`, diferencia maiúsculas)." },
    { name: "exclude", in: "query", schema: { type: "string", maxLength: 500 }, description: "Linha não contém (`!=`)." },
    { name: "regex", in: "query", schema: { type: "string", maxLength: 500 }, description: "Expressão regular RE2 (`|~`)." },
    { name: "level", in: "query", schema: { type: "string" }, description: `Níveis separados por vírgula: ${LOG_LEVELS.join(", ")}.` },
    { name: "pod", in: "query", schema: { type: "string" }, description: "Nome exato do pod (réplica)." },
    { name: "since", in: "query", schema: { type: "string", enum: [...LOG_SINCE] }, description: "Últimos N. Padrão 1h. Ignorado quando há `start`." },
    { name: "start", in: "query", schema: { type: "string", format: "date-time" } },
    { name: "end", in: "query", schema: { type: "string", format: "date-time" }, description: "Padrão: agora." },
    { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: LOG_QUERY_MAX_LIMIT, default: 200 } },
    { name: "direction", in: "query", schema: { type: "string", enum: [...LOG_DIRECTIONS], default: "backward" }, description: "Qual ponta do intervalo vem quando passa do limite." },
  ];

  /** Recusa antecipada por quota: cada violação volta para o campo do formulário. */
  const quotaExceeded = {
    description: "Excede a quota do ambiente",
    content: {
      "application/json": {
        example: {
          error: "QUOTA_EXCEEDED",
          message: "Memória acima da quota do ambiente. Pedido: 2 GiB. Disponível: 1 GiB.",
          errors: [{ path: "profile", message: "Memória acima da quota do ambiente. Pedido: 2 GiB. Disponível: 1 GiB." }],
        },
      },
    },
  };
  const quotaExample = {
    environmentId: "env_123",
    limite: { cpuMillicores: 4000, memoryMib: 8192, pods: 20, storageGi: 100 },
    uso: { cpuMillicores: 1500, memoryMib: 3072, pods: 6, storageGi: 30 },
    disponivel: { cpuMillicores: 2500, memoryMib: 5120, pods: 14, storageGi: 70 },
  };

  return {
    openapi: "3.1.0",
    info: {
      title: "Capiva Cloud API",
      version: "0.1.0",
      description:
        "Plataforma que democratiza o acesso e o deploy em Kubernetes. Contratos gerados a partir de schemas Zod.",
    },
    servers: [{ url: "/api", description: "API" }],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      },
    },
    tags: [
      { name: "Auth", description: "Autenticação, sessão e refresh (cookie-only)" },
      { name: "Organizations", description: "Multi-tenant" },
      { name: "Projects", description: "Projetos" },
      { name: "Environments", description: "Ambientes (Dev/Homolog/Prod) → cluster + namespace" },
      { name: "Clusters", description: "Clusters Kubernetes (kubeconfig cifrado)" },
      { name: "Git", description: "Conexões Git, repos/branches e webhooks" },
      { name: "Applications", description: "Aplicações, deploys e dependências" },
      { name: "Databases", description: "Bancos gerenciados (HA, backups)" },
      { name: "Observability", description: "Logs (busca, download e SSE) e métricas" },
      { name: "FinOps", description: "Quotas por ambiente e custo mensal estimado" },
    ],
    paths: {
      "/auth/register": {
        post: { tags: ["Auth"], summary: "Registrar usuário + organização", requestBody: body(registerSchema), responses: { "201": { description: "Criado" } } },
      },
      "/auth/login": {
        post: { tags: ["Auth"], summary: "Login (seta cookie refresh HttpOnly)", requestBody: body(loginSchema), responses: { "200": { description: "OK" } } },
      },
      "/auth/refresh": {
        post: { tags: ["Auth"], summary: "Rotaciona refresh token (cookie-only)", responses: { "200": { description: "Novo access token" }, "401": { description: "Reuso/expirado" } } },
      },
      "/auth/logout": {
        post: { tags: ["Auth"], summary: "Logout (revoga sessão)", responses: { "204": { description: "Sem conteúdo" } } },
      },
      "/auth/me": {
        get: { tags: ["Auth"], summary: "Usuário atual", security: bearer, responses: { "200": { description: "OK" } } },
      },
      "/organizations": {
        get: { tags: ["Organizations"], summary: "Listar organizações do usuário", security: bearer, responses: { "200": { description: "OK" } } },
        post: { tags: ["Organizations"], summary: "Criar organização", security: bearer, responses: { "201": { description: "Criado" } } },
      },
      "/applications": {
        get: { tags: ["Applications"], summary: "Listar aplicações por projeto", security: bearer, parameters: [orgHeader], responses: { "200": { description: "OK" } } },
        post: {
          tags: ["Applications"],
          summary: "Criar aplicação",
          description:
            "`sourceConfig` carrega a configuração do builder. Para origens com Dockerfile: `dockerfile` (caminho relativo, ex.: `docker/Dockerfile.prod`) e `subPath` (subpasta usada como contexto de build em monorepo). Caminho absoluto ou com `..` é recusado.",
          security: bearer,
          parameters: [orgHeader],
          requestBody: body(createApplicationSchema),
          responses: { "201": { description: "Criado" }, "400": { description: "Caminho de build inválido" }, "403": { description: "Não é membro da organização" }, "422": quotaExceeded },
        },
      },
      "/applications/{id}": {
        get: {
          tags: ["Applications"],
          summary: "Detalhe da aplicação",
          description: "Registro completo. Inclui `previews` (preview deployments por PR, com `previewPrNumber`, `sourceConfig.preview` e `domains`) e, quando a aplicação é um preview, `previewOf`.",
          security: bearer,
          parameters: [appId, orgHeader],
          responses: { "200": { description: "OK" }, "404": { description: "Fora da organização ativa" } },
        },
        patch: {
          tags: ["Applications"],
          summary: "Editar configurações gerais e de build",
          description:
            "Altera nome, perfil, porta, health check e a configuração de build (`dockerfile`, `subPath`, `compose`). Também controla o CD: `autoDeploy` liga/desliga o deploy automático, `watchPaths` restringe o disparo a caminhos do monorepo, `deployTrigger` escolhe o gatilho (`branch` padrão, `tag` ou `release`) e `tagPattern` (glob, ex. `v*`) filtra as tags aceitas. `previewsEnabled` liga os preview deployments por PR (ver docs/37-preview-deployments.md). Mudanças de build valem no próximo deploy.",
          security: bearer,
          parameters: [appId, orgHeader],
          requestBody: body(updateApplicationSchema),
          responses: { "200": { description: "Atualizado" }, "400": { description: "Caminho de build inválido" }, "404": { description: "Fora da organização ativa" }, "422": quotaExceeded },
        },
        delete: { tags: ["Applications"], summary: "Remover aplicação e seus recursos", security: bearer, parameters: [appId, orgHeader], responses: { "204": { description: "Removido" } } },
      },
      "/applications/{id}/previews/{previewId}": {
        delete: {
          tags: ["Applications"],
          summary: "Destruir preview de PR",
          description: "Remove o preview (recursos no cluster e linhas no banco) antes do PR fechar. Um novo push no PR recria o preview.",
          security: bearer,
          parameters: [appId, { name: "previewId", in: "path", required: true, schema: { type: "string" } }, orgHeader],
          responses: { "204": { description: "Removido" }, "404": { description: "Preview não pertence à aplicação" } },
        },
      },
      "/applications/{id}/deploy": {
        post: { tags: ["Applications"], summary: "Disparar deploy", security: bearer, responses: { "202": { description: "Deploy enfileirado" } } },
      },
      "/applications/{id}/rollback": {
        post: {
          tags: ["Applications"],
          summary: "Rollback para um deploy anterior",
          description: "Republica a imagem de um deploy saudável anterior, sem rebuild. Exige DEVELOPER ou superior.",
          security: bearer,
          parameters: [appId, orgHeader],
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["deploymentId"], properties: { deploymentId: { type: "string" } } } } } },
          responses: { "202": { description: "Deploy de rollback criado" }, "400": { description: "Deploy alvo sem imagem" }, "403": { description: "VIEWER não pode" } },
        },
      },
      "/applications/{id}/restart": {
        post: { tags: ["Applications"], summary: "Reiniciar pods (rollout restart)", description: "Exige DEVELOPER ou superior.", security: bearer, parameters: [appId, orgHeader], responses: { "202": { description: "Reinício solicitado" }, "403": { description: "VIEWER não pode" } } },
      },
      "/applications/{id}/scaling": {
        get: { tags: ["Applications"], summary: "Política de autoscaling (HPA)", security: bearer, parameters: [appId, orgHeader], responses: { "200": { description: "Política ou null" } } },
        put: {
          tags: ["Applications"],
          summary: "Definir mínimo, máximo, métrica e alvo do HPA",
          description: "Só para estratégia ROLLING. Exige DEVELOPER ou superior.",
          security: bearer,
          parameters: [appId, orgHeader],
          requestBody: body(setScalingSchema),
          responses: { "200": { description: "Política salva" }, "400": { description: "Estratégia sem HPA ou máximo menor que o mínimo" }, "403": { description: "VIEWER não pode" } },
        },
      },
      "/applications/{id}/scaling/status": {
        get: { tags: ["Applications"], summary: "Estado vivo da escala (HPA e réplicas atuais)", security: bearer, parameters: [appId, orgHeader], responses: { "200": { description: "OK" } } },
      },
      "/applications/{id}/scaling/replicas": {
        post: {
          tags: ["Applications"],
          summary: "Escalar réplicas manualmente (0 a 100)",
          description: "Com HPA ativo, o autoscaler pode sobrescrever o valor. Exige DEVELOPER ou superior.",
          security: bearer,
          parameters: [appId, orgHeader],
          requestBody: body(scaleReplicasSchema),
          responses: { "200": { description: "Réplicas aplicadas" }, "400": { description: "Ambiente sem cluster" }, "403": { description: "VIEWER não pode" } },
        },
      },
      "/applications/{id}/security": {
        put: {
          tags: ["Applications"],
          summary: "Política de scan de vulnerabilidades (Trivy)",
          description:
            "Grava em `sourceConfig.security`. `scanEnabled` (default true) liga o scan da imagem antes de cada deploy; `blockOnSeverity` (`none` default, `critical`, `high`) falha o deploy quando a imagem tem vulnerabilidade daquele nível ou acima. Falha do próprio scanner nunca bloqueia. O resumo de cada scan sai em `scanSummary` nos deploys (`GET /applications/{id}/deployments`). Vale a partir do próximo deploy.",
          security: bearer,
          parameters: [appId, orgHeader],
          requestBody: body(scanPolicySchema),
          responses: { "200": { description: "Aplicação atualizada" }, "400": { description: "Política inválida" }, "404": { description: "Fora da organização ativa" } },
        },
      },
      "/applications/{id}/dependencies": {
        get: { tags: ["Applications"], summary: "Listar dependências", security: bearer, responses: { "200": { description: "OK" } } },
        post: { tags: ["Applications"], summary: "Conectar dependência (injeta URL)", security: bearer, responses: { "201": { description: "Conectado" } } },
      },
      "/applications/{id}/logs": {
        get: {
          tags: ["Observability"],
          summary: "Buscar logs com filtros",
          description:
            "Monta a consulta ao Loki a partir dos filtros. O escopo (namespace e app da aplicação) é sempre o do servidor: nenhum filtro consegue ler logs de outra aplicação. Sem `LOKI_URL`, os filtros valem sobre as linhas de exemplo. Linhas em ordem cronológica, com `level` detectado (JSON `level`, logfmt `level=` ou palavra ERROR/WARN/INFO/DEBUG).",
          security: bearer,
          parameters: [appId, orgHeader, ...logParams],
          responses: {
            "200": { description: "`{ lines: [{ ts, line, pod?, level? }] }` (`ts` em nanossegundos)" },
            "400": { description: "Filtro recusado pelo Loki (regex RE2 inválida)" },
            "404": { description: "Fora da organização ativa" },
            "422": { description: "Filtro inválido (mensagens em português)" },
          },
        },
      },
      "/applications/{id}/logs/pods": {
        get: {
          tags: ["Observability"],
          summary: "Pods com log no intervalo",
          security: bearer,
          parameters: [appId, orgHeader, ...logParams.filter((p) => ["since", "start", "end"].includes(p.name))],
          responses: { "200": { description: "`{ pods: string[] }` (vazio sem Loki)" }, "404": { description: "Fora da organização ativa" } },
        },
      },
      "/applications/{id}/logs/download": {
        get: {
          tags: ["Observability"],
          summary: "Baixar logs filtrados (.txt ou .ndjson)",
          description: `Mesmos filtros da busca. A resposta sai em streaming, paginando o Loki, até \`maxLines\` (teto ${LOG_DOWNLOAD_MAX_LINES}). \`direction=backward\` (padrão) começa pela linha mais recente.`,
          security: bearer,
          parameters: [
            appId,
            orgHeader,
            ...logParams.filter((p) => p.name !== "limit"),
            { name: "format", in: "query", schema: { type: "string", enum: [...LOG_EXPORT_FORMATS], default: "txt" } },
            { name: "maxLines", in: "query", schema: { type: "integer", minimum: 1, maximum: LOG_DOWNLOAD_MAX_LINES, default: LOG_DOWNLOAD_DEFAULT_LINES } },
          ],
          responses: {
            "200": { description: "Arquivo", content: { "text/plain": { schema: { type: "string" } }, "application/x-ndjson": { schema: { type: "string" } } } },
            "404": { description: "Fora da organização ativa" },
            "422": { description: "Filtro inválido" },
          },
        },
      },
      "/streams/applications/{id}/logs": {
        get: {
          tags: ["Observability"],
          summary: "Live tail de logs (SSE)",
          description:
            "Evento `logs` a cada 2s com as linhas dos últimos 30 minutos (até 200). Aceita `q`, `exclude`, `regex`, `level` e `pod`; intervalo e limite não se aplicam. Autentica por `access_token` e `org` na query (EventSource não envia headers).",
          parameters: [appId, ...logParams.filter((p) => ["q", "exclude", "regex", "level", "pod"].includes(p.name))],
          responses: { "200": { description: "text/event-stream" }, "422": { description: "Filtro inválido" } },
        },
      },
      "/applications/{id}/metrics": {
        get: { tags: ["Observability"], summary: "Métricas simples (CPU/mem/req/lat/erros)", security: bearer, responses: { "200": { description: "OK" } } },
      },
      "/applications/{id}/alert-rules": {
        get: {
          tags: ["Observability"],
          summary: "Listar regras de alerta por métrica",
          description: "Cada regra traz o estado atual (`OK`/`FIRING`), o último valor medido e quando foi avaliada.",
          security: bearer,
          parameters: [appId, orgHeader],
          responses: { "200": { description: "OK" }, "404": { description: "Fora da organização ativa" } },
        },
        post: {
          tags: ["Observability"],
          summary: "Criar regra de alerta",
          description:
            "Métricas: `CPU` (% de um núcleo), `MEMORY` (MiB), `ERROR_RATE_5XX` (% de respostas 5xx) e `LATENCY_P95` (ms). `operator` `GT`/`LT` compara com `threshold` na janela `windowMinutes` (1 a 60). CPU e memória vêm do Prometheus, com o metrics-server como reserva; 5xx e latência vêm do access log do Traefik no Loki e exigem domínio. A cada minuto o scheduler avalia a regra e dispara `alert.triggered`/`alert.resolved` só na transição de estado, pelos canais de notificação que escutam esses eventos.",
          security: bearer,
          parameters: [appId, orgHeader],
          requestBody: body(createAlertRuleSchema),
          responses: { "201": { description: "Criado" }, "404": { description: "Aplicação fora da organização ativa" }, "422": { description: "Dados inválidos" } },
        },
      },
      "/applications/{id}/alert-rules/{ruleId}": {
        patch: {
          tags: ["Observability"],
          summary: "Alterar regra de alerta",
          description: "Campos ausentes ficam como estão. Desligar a regra (`enabled: false`) volta o estado para `OK` sem notificar.",
          security: bearer,
          parameters: [appId, ruleId, orgHeader],
          requestBody: body(updateAlertRuleSchema),
          responses: { "200": { description: "Atualizado" }, "404": { description: "Regra não encontrada" }, "422": { description: "Dados inválidos" } },
        },
        delete: {
          tags: ["Observability"],
          summary: "Remover regra de alerta",
          security: bearer,
          parameters: [appId, ruleId, orgHeader],
          responses: { "204": { description: "Removido" }, "404": { description: "Regra não encontrada" } },
        },
      },
      "/notifications/events": {
        get: {
          tags: ["Observability"],
          summary: "Eventos que um canal de notificação pode escutar",
          description:
            "`deploy.succeeded`, `deploy.failed`, `deploy.rollback` (manual, automático após falha ou abort do Argo), `downtime`/`recovery` (transição do uptime check) e `alert.triggered`/`alert.resolved` (transição de uma regra de alerta).",
          security: bearer,
          responses: { "200": { description: "Lista de eventos" } },
        },
      },
      "/projects": {
        get: { tags: ["Projects"], summary: "Listar projetos", security: bearer, responses: { "200": { description: "OK" } } },
        post: { tags: ["Projects"], summary: "Criar projeto", security: bearer, responses: { "201": { description: "Criado" } } },
      },
      "/environments": {
        get: { tags: ["Environments"], summary: "Listar ambientes", security: bearer, responses: { "200": { description: "OK" } } },
        post: { tags: ["Environments"], summary: "Criar ambiente", security: bearer, requestBody: body(createEnvironmentSchema), responses: { "201": { description: "Criado" } } },
      },
      "/clusters": {
        get: { tags: ["Clusters"], summary: "Listar clusters", security: bearer, responses: { "200": { description: "OK" } } },
        post: { tags: ["Clusters"], summary: "Registrar cluster (kubeconfig cifrado)", security: bearer, requestBody: body(createClusterSchema), responses: { "201": { description: "Criado" } } },
      },
      "/git-connections": {
        get: { tags: ["Git"], summary: "Listar conexões Git", security: bearer, responses: { "200": { description: "OK" } } },
        post: { tags: ["Git"], summary: "Conectar provedor Git", security: bearer, requestBody: body(createGitConnectionSchema), responses: { "201": { description: "Criado" } } },
      },
      "/git-connections/{id}/repos": {
        get: { tags: ["Git"], summary: "Listar repositórios", security: bearer, responses: { "200": { description: "OK" } } },
      },
      "/webhooks/git/{connectionId}": {
        post: {
          tags: ["Git"],
          summary: "Receber webhook Git (push, tag, release, PR/MR)",
          description:
            "Endpoint público, fora de `/api`, autenticado pela assinatura (`X-Hub-Signature-256` no GitHub/Gitea, `X-Gitlab-Token` no GitLab). O tipo vem de `X-GitHub-Event`, `X-Gitlab-Event` ou `X-Gitea-Event` (sem header, é deduzido do corpo). Push, tag e release disparam deploy nas aplicações cujo `sourceConfig.deployTrigger` (`branch`, `tag`, `release`) e `tagPattern` casam. PR/MR (opened, synchronized, reopened, closed, merged) não fazem deploy: são publicados no barramento interno `gitEvents`.",
          servers: [{ url: "/", description: "Raiz (fora de /api)" }],
          parameters: [{ name: "connectionId", in: "path", required: true, schema: { type: "string" } }],
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", description: "Payload original do provedor" } } } },
          responses: {
            "200": {
              description: "Processado",
              content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, triggered: { type: "integer" } } }, example: { ok: true, triggered: 1 } } },
            },
            "401": { description: "Assinatura inválida" },
            "404": { description: "Conexão Git não encontrada" },
          },
        },
      },
      "/databases": {
        get: { tags: ["Databases"], summary: "Listar bancos do projeto", security: bearer, responses: { "200": { description: "OK" } } },
        post: { tags: ["Databases"], summary: "Criar banco gerenciado", security: bearer, requestBody: body(createDatabaseSchema), responses: { "201": { description: "Criado" }, "422": quotaExceeded } },
      },
      "/environments/{id}/quota": {
        get: {
          tags: ["FinOps"],
          summary: "Quota do ambiente: limite, uso e disponível",
          description: "Uso conta as réplicas MÁXIMAS do HPA, os volumes e os bancos gerenciados do ambiente. `null` no limite = sem limite.",
          security: bearer,
          parameters: [appId, orgHeader],
          responses: { "200": { description: "OK", content: { "application/json": { example: quotaExample } } }, "404": { description: "Fora da organização ativa" } },
        },
        put: {
          tags: ["FinOps"],
          summary: "Definir quota do ambiente (ADMIN+)",
          description: "Grava os limites e aplica `ResourceQuota` + `LimitRange` no namespace do ambiente. Todos os campos `null` removem a quota do cluster.",
          security: bearer,
          parameters: [appId, orgHeader],
          requestBody: body(setQuotaSchema),
          responses: { "200": { description: "Atualizado", content: { "application/json": { example: quotaExample } } }, "422": { description: "Limite inválido" } },
        },
      },
      "/costs": {
        get: {
          tags: ["FinOps"],
          summary: "Custo mensal estimado da organização",
          description:
            "Estimativa (sem cobrança) por aplicação (com volumes), banco gerenciado, projeto e ambiente, com mínimo e máximo do HPA. Preços vêm de `CAPIVA_PRICE_*`.",
          security: bearer,
          parameters: [orgHeader],
          responses: { "200": { description: "OK" } },
        },
      },
      "/costs/estimate/application": {
        get: {
          tags: ["FinOps"],
          summary: "Estimativa de custo mensal de uma aplicação (wizard)",
          security: bearer,
          parameters: [
            orgHeader,
            { name: "profile", in: "query", required: true, schema: { type: "string", enum: ["NANO", "SMALL", "MEDIUM", "LARGE", "XLARGE"] } },
            { name: "minReplicas", in: "query", required: false, schema: { type: "integer", minimum: 1 } },
            { name: "maxReplicas", in: "query", required: false, schema: { type: "integer", minimum: 1 } },
          ],
          responses: { "200": { description: "OK", content: { "application/json": { example: { currency: "BRL", custo: { min: 46.43, max: 46.43 } } } } } },
        },
      },
      ...buildRestorePaths(bearer, orgHeader),
    },
  };
}
