import { z } from "zod";
import { registerSchema, loginSchema } from "@schemas/auth.schema";
import { createApplicationSchema, updateApplicationSchema } from "@schemas/application.schema";
import { LOG_DIRECTIONS, LOG_EXPORT_FORMATS, LOG_LEVELS, LOG_SINCE } from "@interface/logs";
import { LOG_DOWNLOAD_DEFAULT_LINES, LOG_DOWNLOAD_MAX_LINES, LOG_QUERY_MAX_LIMIT } from "@schemas/logs.schema";
import {
  createClusterSchema,
  createDatabaseSchema,
  createEnvironmentSchema,
  createGitConnectionSchema,
} from "@schemas/resource.schema";

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
          responses: { "201": { description: "Criado" }, "400": { description: "Caminho de build inválido" }, "403": { description: "Não é membro da organização" } },
        },
      },
      "/applications/{id}": {
        get: { tags: ["Applications"], summary: "Detalhe da aplicação", security: bearer, parameters: [appId, orgHeader], responses: { "200": { description: "OK" }, "404": { description: "Fora da organização ativa" } } },
        patch: {
          tags: ["Applications"],
          summary: "Editar configurações gerais e de build",
          description:
            "Altera nome, perfil, porta, health check e a configuração de build (`dockerfile`, `subPath`, `compose`). Também controla o CD: `autoDeploy` liga/desliga o deploy por push e `watchPaths` restringe o disparo a caminhos do monorepo. Mudanças de build valem no próximo deploy.",
          security: bearer,
          parameters: [appId, orgHeader],
          requestBody: body(updateApplicationSchema),
          responses: { "200": { description: "Atualizado" }, "400": { description: "Caminho de build inválido" }, "404": { description: "Fora da organização ativa" } },
        },
        delete: { tags: ["Applications"], summary: "Remover aplicação e seus recursos", security: bearer, parameters: [appId, orgHeader], responses: { "204": { description: "Removido" } } },
      },
      "/applications/{id}/deploy": {
        post: { tags: ["Applications"], summary: "Disparar deploy", security: bearer, responses: { "202": { description: "Deploy enfileirado" } } },
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
      "/databases": {
        get: { tags: ["Databases"], summary: "Listar bancos do projeto", security: bearer, responses: { "200": { description: "OK" } } },
        post: { tags: ["Databases"], summary: "Criar banco gerenciado", security: bearer, requestBody: body(createDatabaseSchema), responses: { "201": { description: "Criado" } } },
      },
    },
  };
}
