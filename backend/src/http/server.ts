import {GlobalRouter, RegistryRouter} from "@mateusseiboth/ts-decorators";
import {errorHandler} from "@middleware/errorHandler";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import path from "path";

const ORIGIN_WHITELIST = ["http://localhost:5173", "http://localhost:5175"];

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

  constructor(port = 3000) {
    this.app = express();
    this.app.use((req, res, next) => {
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
  }

  @RegistryRouter({
    folder: path.join(__dirname, "routes/web"),
    middlewares: [cors({credentials: true, origin: ORIGIN_WHITELIST})],
  })
  async configureWebRoutes(): Promise<void> {}

  @RegistryRouter({
    folder: path.join(__dirname, "routes/api"),
    prefix: "/api",
    middlewares: [
      cors({origin: ORIGIN_WHITELIST, credentials: true}),
      express.json({limit: "10mb"}),
      express.urlencoded({extended: true}),
      cookieParser(),
    ],
  })
  async configureApiRoutes(): Promise<void> {}

  async stop(): Promise<void> {
    this.server?.close();
  }
}

export default HttpServer;
