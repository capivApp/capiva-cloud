import type { Router } from "express";
import { buildCapivaJsonSchema } from "@schemas/capivaConfig.schema";

/**
 * JSON Schemas públicos → /schemas/*. O `capiva.json` aponta para cá no campo
 * `$schema` e o editor ganha autocompletar e validação. Gerado do schema Zod.
 */
export const registry = (router: Router): void => {
  const capiva = buildCapivaJsonSchema();

  router.get("/capiva.json", (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=300");
    res.type("application/schema+json").send(JSON.stringify(capiva));
  });
};
