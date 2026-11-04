import { GlobalRouter, RegistryRouter } from "@mateusseiboth/ts-decorators";
import { errorHandler } from "@middleware/errorHandler";
import { securityHeaders } from "@middleware/securityHeaders";
import { apiRateLimit } from "@middleware/rateLimit";
import { config } from "../config";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import path from "path";

/**
 * Origens de CORS. Vem de `ORIGIN_WHITELIST` (ver config). Lista vazia em
 * produção é o caso normal do deploy padrão: o nginx serve painel e API na
 * MESMA origem, então nenhuma requisição cross-origin precisa ser liberada.
 */
const corsOptions: cors.CorsOptions = {
  credentials: true,
  origin: config.originWhitelist.length ? config.originWhitelist : false,
};

interface Routable {
  initializeRoutes(): Promise<void>;
}

/**
 * Servidor HTTP. Usa o file-based routing do framework interno (@RegistryRouter):
 *  - /api/*  → rotas autenticadas/aplicação
 *  - /       → rotas públicas (health, docs)
 */
@GlobalRouter()
class HttpServer {
  private app: express.Application;
  private server: ReturnType<express.Application["listen"]> | null = null;
  private port: number;
  /** Conexões abertas — rastreadas para encerrar o processo sem esperar keep-alive. */
  private connections = new Set<import("net").Socket>();
  private shuttingDown = false;

  constructor(port = 3000) {
    this.app = express();
    // Atrás do nginx/Traefik: sem isto req.ip é o IP do proxy e o rate limit
    // por IP vira um balde único para todo mundo.
    this.app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS ?? 1));
    this.app.disable("x-powered-by");
    this.app.use((req, res, next) => {
      // Durante o shutdown recusamos requisições NOVAS (o balanceador tira a
      // réplica da rotação) enquanto as em voo terminam.
      if (this.shuttingDown) {
        res.setHeader("Connection", "close");
        res.status(503).json({ error: "Servidor encerrando." });
        return;
      }
      console.log(`[${req.method}] ${req.url}`);
      next();
    });
    this.port = port;
  }

  async init(): Promise<void> {
    await (this as unknown as Routable).initializeRoutes();
    this.app.use(errorHandler);
    this.server = this.app.listen(this.port, () => {
      console.log(`🐹 Capiva Cloud API em http://localhost:${this.port}`);
      console.log(`📚 Docs (Scalar) em http://localhost:${this.port}/docs`);
    });
    this.server.on("connection", (socket) => {
      this.connections.add(socket);
      socket.on("close", () => this.connections.delete(socket));
    });
  }

  @RegistryRouter({
    folder: path.join(__dirname, "routes/web"),
    middlewares: [cors(corsOptions)],
  })
  async configureWebRoutes(): Promise<void> {}

  @RegistryRouter({
    folder: path.join(__dirname, "routes/api"),
    prefix: "/api",
    middlewares: [
      securityHeaders,
      cors(corsOptions),
      apiRateLimit,
      express.json({ limit: "10mb" }),
      express.urlencoded({ extended: true }),
      cookieParser(),
    ],
  })
  async configureApiRoutes(): Promise<void> {}

  /**
   * Encerramento gracioso: para de aceitar conexões, deixa as requisições em voo
   * concluírem e só então derruba os sockets ociosos. Sem isto, todo rollout
   * (que envia SIGTERM) corta respostas no meio.
   */
  async stop(graceMs = Number(process.env.SHUTDOWN_GRACE_MS ?? 15_000)): Promise<void> {
    if (!this.server || this.shuttingDown) return;
    this.shuttingDown = true;

    await new Promise<void>((resolve) => {
      const forced = setTimeout(() => {
        console.warn(
          `[http] ${this.connections.size} conexão(ões) ainda aberta(s) após ${graceMs}ms — encerrando.`,
        );
        for (const socket of this.connections) socket.destroy();
        resolve();
      }, graceMs);

      this.server!.close(() => {
        clearTimeout(forced);
        resolve();
      });
    });
  }
}

export default HttpServer;
