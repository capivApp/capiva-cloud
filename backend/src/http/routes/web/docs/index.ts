import type { Router } from "express";
import { apiReference } from "@scalar/express-api-reference";
import { buildOpenApiDocument } from "@openapi/document";

/**
 * Documentação de API → /docs (UI Scalar) e /docs/openapi.json (spec).
 * Spec gerada a partir dos schemas Zod. A UI consome a spec por URL.
 */
export const registry = (router: Router): void => {
  const spec = buildOpenApiDocument();

  router.get("/openapi.json", (_req, res) => {
    res.json(spec);
  });

  // O tipo de configuração do Scalar é uma união ampla (content|url|sources);
  // usamos `url` e um cast pontual para evitar atrito de tipos do pacote.
  router.use(
    "/",
    apiReference({ url: "/docs/openapi.json", pageTitle: "Capiva Cloud API" } as never),
  );
};
