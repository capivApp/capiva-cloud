import type { Router } from "express";

/** Rotas públicas (sem auth) → / */
export const registry = (router: Router): void => {
  router.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "capiva-cloud", time: new Date().toISOString() });
  });

  router.get("/", (_req, res) => {
    res.json({
      name: "Capiva Cloud",
      tagline: "Democratizando o acesso e o deploy em Kubernetes 🐹",
      docs: "/docs",
      health: "/health",
    });
  });
};
