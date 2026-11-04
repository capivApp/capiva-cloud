import type { Request, Response } from "express";
import { Injectable } from "@di/index";
import { ObservabilityService } from "@service/ObservabilityService";
import { DeploymentService } from "@service/DeploymentService";
import { ScalingService } from "@service/ScalingService";
import { ManagedDatabaseService } from "@service/ManagedDatabaseService";
import { deploymentEvents } from "@infra/realtime/EventBus";
import { tenantOf } from "@functions/tenant";
import { logDownloadSchema, logFiltrosSchema } from "@schemas/logs.schema";
import {
  createLogExportFormat,
  type LogExportStrategy,
} from "@service/logSearch/logExport.strategy";
import type { LogLine } from "@interface/logs";

function openSse(res: Response): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write("\n");
}

const buildLogFileName = (app: string, extension: string, now: Date): string =>
  `${app.replace(/[^a-zA-Z0-9._-]/g, "-")}-logs-${now.toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "-")}.${extension}`;

/**
 * Escreve as páginas conforme chegam. Erro antes do primeiro byte ainda vira resposta
 * JSON no errorHandler; depois disso só dá para encerrar o arquivo.
 */
async function streamLogPages(
  req: Request,
  res: Response,
  pages: AsyncGenerator<LogLine[]>,
  format: LogExportStrategy,
): Promise<void> {
  let closed = false;
  req.on("close", () => (closed = true));
  try {
    for await (const page of pages) {
      if (closed) break;
      res.write(page.map((line) => format.serialize(line)).join(""));
    }
  } catch (error) {
    if (!res.headersSent) throw error;
    console.error("[logs] download interrompido", error);
  }
  res.end();
}

@Injectable()
export class ObservabilityController {
  constructor(
    private readonly observability: ObservabilityService,
    private readonly deployments: DeploymentService,
    private readonly scaling: ScalingService,
    private readonly databases: ManagedDatabaseService,
  ) {}

  /** SSE: estado vivo de um banco gerenciado (fase/réplicas/saúde) a cada 3s. */
  streamDatabase = async (req: Request, res: Response): Promise<void> => {
    const id = String(req.params.id);
    const tenant = tenantOf(req);
    openSse(res);
    let stop = false;
    req.on("close", () => (stop = true));
    while (!stop) {
      const status = await this.databases.status(id, tenant).catch(() => null);
      res.write(`event: database\ndata: ${JSON.stringify(status)}\n\n`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  };

  /** SSE: progresso/timeline de um deploy em tempo real. */
  streamDeployment = async (req: Request, res: Response): Promise<void> => {
    const deploymentId = String(req.params.deploymentId);
    openSse(res);

    // Estado atual + eventos já registrados.
    const current = await this.deployments.getById(deploymentId, tenantOf(req));
    if (current) res.write(`event: snapshot\ndata: ${JSON.stringify(current)}\n\n`);

    const unsubscribe = deploymentEvents.subscribe(deploymentId, (payload) => {
      res.write(`event: progress\ndata: ${JSON.stringify(payload)}\n\n`);
      if (payload.done) res.end();
    });
    req.on("close", unsubscribe);
  };

  /** SSE: logs crus do build (Job Kaniko) a cada 2s até concluir. */
  streamBuildLogs = async (req: Request, res: Response): Promise<void> => {
    const deploymentId = String(req.params.deploymentId);
    const tenant = tenantOf(req);
    openSse(res);
    let stop = false;
    req.on("close", () => (stop = true));
    while (!stop) {
      const logs = await this.deployments.buildLogs(deploymentId, tenant).catch(() => "");
      res.write(`event: build\ndata: ${JSON.stringify({ logs })}\n\n`);
      const current = await this.deployments.getById(deploymentId, tenant).catch(() => null);
      // Encerra o stream quando o deploy saiu da fase de build.
      if (current && !["QUEUED", "BUILDING", "PUSHING"].includes(current.status)) {
        res.write(`event: build\ndata: ${JSON.stringify({ logs, done: true })}\n\n`);
        break;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    res.end();
  };

  /** JSON: busca de logs com filtros (texto, regex, nível, pod, intervalo). */
  searchLogs = async (req: Request, res: Response): Promise<void> => {
    const filtros = logFiltrosSchema.parse(req.query);
    res.json(await this.observability.searchLogs(String(req.params.id), tenantOf(req), filtros));
  };

  /** JSON: pods com log no intervalo, para o filtro da tela. */
  logPods = async (req: Request, res: Response): Promise<void> => {
    const filtros = logFiltrosSchema.parse(req.query);
    res.json(await this.observability.logPods(String(req.params.id), tenantOf(req), filtros));
  };

  /** Arquivo .txt/.ndjson com os logs filtrados, em streaming, até `maxLines`. */
  downloadLogs = async (req: Request, res: Response): Promise<void> => {
    const { filtros, format, maxLines } = logDownloadSchema.parse(req.query);
    const { app, pages } = await this.observability.exportLogs(
      String(req.params.id),
      tenantOf(req),
      filtros,
      maxLines,
    );
    const strategy = createLogExportFormat(format);
    res.setHeader("Content-Type", strategy.contentType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${buildLogFileName(app, strategy.extension, new Date())}"`,
    );
    await streamLogPages(req, res, pages, strategy);
  };

  /** SSE: logs ao vivo (poll do Loki a cada 2s), com os filtros de texto/nível/pod. */
  streamLogs = async (req: Request, res: Response): Promise<void> => {
    const applicationId = String(req.params.id);
    const tenant = tenantOf(req);
    const filtros = logFiltrosSchema.parse(req.query);
    openSse(res);

    let stop = false;
    req.on("close", () => (stop = true));
    while (!stop) {
      // Filtro recusado pelo Loki não derruba o stream: a busca mostra o erro.
      const lines = await this.observability.logs(applicationId, tenant, filtros).catch(() => []);
      res.write(`event: logs\ndata: ${JSON.stringify(lines)}\n\n`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  };

  /** SSE: estado vivo do autoscaling (réplicas/métrica/alvo) a cada 4s. */
  streamScaling = async (req: Request, res: Response): Promise<void> => {
    const applicationId = String(req.params.id);
    const tenant = tenantOf(req);
    openSse(res);
    let stop = false;
    req.on("close", () => (stop = true));
    while (!stop) {
      const status = await this.scaling.status(applicationId, tenant).catch(() => null);
      res.write(`event: scaling\ndata: ${JSON.stringify(status)}\n\n`);
      await new Promise((r) => setTimeout(r, 4000));
    }
  };

  /** JSON: métricas simples (CPU/mem/req/latência/erros). */
  metrics = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.observability.metrics(String(req.params.id), tenantOf(req)));
  };

  /** SSE: métricas em tempo real (push a cada 3s — substitui polling no front). */
  streamMetrics = async (req: Request, res: Response): Promise<void> => {
    const applicationId = String(req.params.id);
    const tenant = tenantOf(req);
    openSse(res);
    let stop = false;
    req.on("close", () => (stop = true));
    while (!stop) {
      const m = await this.observability.metrics(applicationId, tenant);
      res.write(`event: metrics\ndata: ${JSON.stringify(m)}\n\n`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  };
}
