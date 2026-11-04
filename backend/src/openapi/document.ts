import { z } from "zod";
import { registerSchema, loginSchema } from "@schemas/auth.schema";
import { createApplicationSchema, scaleReplicasSchema, setScalingSchema, updateApplicationSchema } from "@schemas/application.schema";
import { createAlertRuleSchema, updateAlertRuleSchema } from "@schemas/alert.schema";
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
  const ruleId = { name: "ruleId", in: "path", required: true, schema: { type: "string" } };

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
      { name: "Observability", description: "Logs (SSE) e métricas" },
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
            "Altera nome, perfil, porta, health check e a configuração de build (`dockerfile`, `subPath`, `compose`). Também controla o CD: `autoDeploy` liga/desliga o deploy por push e `watchPaths` restringe o disparo a caminhos do monorepo. `previewsEnabled` liga os preview deployments por PR (ver docs/37-preview-deployments.md). Mudanças de build valem no próximo deploy.",
          security: bearer,
          parameters: [appId, orgHeader],
          requestBody: body(updateApplicationSchema),
          responses: { "200": { description: "Atualizado" }, "400": { description: "Caminho de build inválido" }, "404": { description: "Fora da organização ativa" } },
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
      "/applications/{id}/dependencies": {
        get: { tags: ["Applications"], summary: "Listar dependências", security: bearer, responses: { "200": { description: "OK" } } },
        post: { tags: ["Applications"], summary: "Conectar dependência (injeta URL)", security: bearer, responses: { "201": { description: "Conectado" } } },
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
      "/databases": {
        get: { tags: ["Databases"], summary: "Listar bancos do projeto", security: bearer, responses: { "200": { description: "OK" } } },
        post: { tags: ["Databases"], summary: "Criar banco gerenciado", security: bearer, requestBody: body(createDatabaseSchema), responses: { "201": { description: "Criado" } } },
      },
    },
  };
}
