import type { Request, Response } from "express";
import { Injectable } from "@di/index";
import { ObservabilityService } from "@service/ObservabilityService";
import { DeploymentService } from "@service/DeploymentService";
import { deploymentEvents } from "@infra/realtime/EventBus";
import { tenantOf } from "@functions/tenant";

function openSse(res: Response): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write("\n");
}

@Injectable()
export class ObservabilityController {
  constructor(
    private readonly observability: ObservabilityService,
    private readonly deployments: DeploymentService,
  ) {}

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

  /** SSE: logs ao vivo (poll do Loki a cada 2s). */
  streamLogs = async (req: Request, res: Response): Promise<void> => {
    const applicationId = String(req.params.id);
    const tenant = tenantOf(req);
    openSse(res);

    let stop = false;
    req.on("close", () => (stop = true));
    while (!stop) {
      const lines = await this.observability.logs(applicationId, tenant);
      res.write(`event: logs\ndata: ${JSON.stringify(lines)}\n\n`);
      await new Promise((r) => setTimeout(r, 2000));
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
