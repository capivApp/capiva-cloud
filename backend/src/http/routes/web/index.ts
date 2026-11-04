import type { Router } from "express";
import prismaClient from "@database/prisma";

/**
 * Rotas públicas (sem auth) → /
 *
 * A separação entre liveness e readiness é o que permite rollout sem queda:
 *  - `/health` (liveness): o processo está vivo? Não toca o banco — se tocasse,
 *    uma instabilidade do Postgres faria o Kubernetes MATAR todas as réplicas.
 *  - `/ready` (readiness): dá para atender request? Verifica a dependência real.
 *    Falhar aqui só tira a réplica do balanceador, sem reiniciar nada.
 */
export const registry = (router: Router): void => {
  router.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "capiva-cloud", time: new Date().toISOString() });
  });

  router.get("/ready", async (_req, res) => {
    try {
      await prismaClient.$queryRaw`SELECT 1`;
      res.json({ status: "ready", database: "up", time: new Date().toISOString() });
    } catch (error) {
      res
        .status(503)
        .json({ status: "unready", database: "down", error: (error as Error).message });
    }
  });

  router.get("/", (_req, res) => {
    res.json({
      name: "Capiva Cloud",
      tagline: "Democratizando o acesso e o deploy em Kubernetes 🐹",
      docs: "/docs",
      health: "/health",
      ready: "/ready",
    });
  });
};
