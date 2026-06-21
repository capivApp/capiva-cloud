import { z } from "zod";
import { registerSchema, loginSchema } from "@schemas/auth.schema";
import { createApplicationSchema } from "@schemas/application.schema";
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
        get: { tags: ["Applications"], summary: "Listar aplicações por projeto", security: bearer, responses: { "200": { description: "OK" } } },
        post: { tags: ["Applications"], summary: "Criar aplicação", security: bearer, requestBody: body(createApplicationSchema), responses: { "201": { description: "Criado" } } },
      },
      "/applications/{id}/deploy": {
        post: { tags: ["Applications"], summary: "Disparar deploy", security: bearer, responses: { "202": { description: "Deploy enfileirado" } } },
      },
      "/applications/{id}/dependencies": {
        get: { tags: ["Applications"], summary: "Listar dependências", security: bearer, responses: { "200": { description: "OK" } } },
        post: { tags: ["Applications"], summary: "Conectar dependência (injeta URL)", security: bearer, responses: { "201": { description: "Conectado" } } },
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
