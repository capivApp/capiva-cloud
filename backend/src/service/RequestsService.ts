import { Injectable } from "@di/index";
import { LokiAdapter } from "@infra/observability/LokiAdapter";
import { ApplicationRepository } from "@repository/ApplicationRepository";
import { EnvironmentRepository } from "@repository/EnvironmentRepository";
import { withTransaction } from "@database/withTransaction";
import { HttpError } from "@functions/HttpError";

export interface RequestEntry {
  time: string;
  method: string;
  host: string;
  path: string;
  status: number;
  durationMs: number;
}

/**
 * Requests recebidos pelo Traefik (access log JSON → Loki). A Service traduz o
 * host/app num seletor de logs do Traefik e parseia as linhas em entradas
 * estruturadas. Sem a stack (Loki), devolve um conjunto simulado para a UI.
 */
@Injectable()
export class RequestsService {
  constructor(
    private readonly loki: LokiAdapter,
    private readonly apps: ApplicationRepository,
    private readonly environments: EnvironmentRepository,
  ) {}

  /** Lista requisições por host (domínio) ou por aplicação. */
  async list(tenant: { organizationId: string }, opts: { host?: string; applicationId?: string }): Promise<RequestEntry[]> {
    const host = opts.host ?? (opts.applicationId ? await this.hostOf(opts.applicationId, tenant) : undefined);
    // Access log do Traefik (entrypoint) — filtra pelo host quando informado.
    const hostFilter = host ? ` |~ \`${host}\`` : "";
    const selector = `{namespace="kube-system",pod=~"traefik.*"}${hostFilter}`;
    const lines = await this.loki.queryBySelector(selector, 200);

    const parsed = lines.map((l) => this.parse(l.line)).filter((e): e is RequestEntry => e !== null);
    if (parsed.length > 0) return parsed.reverse();
    return this.simulated(host);
  }

  private async hostOf(applicationId: string, tenant: { organizationId: string }): Promise<string | undefined> {
    const app = await withTransaction(() => this.apps.findById(applicationId), { tenant });
    if (!app) throw HttpError.notFound("Aplicação não encontrada.");
    return (app.sourceConfig as Record<string, unknown>)?.domain as string | undefined;
  }

  /** Parseia uma linha de access log JSON do Traefik numa entrada estruturada. */
  private parse(line: string): RequestEntry | null {
    const start = line.indexOf("{");
    if (start < 0) return null;
    try {
      const log = JSON.parse(line.slice(start)) as Record<string, unknown>;
      if (!log.RequestMethod && !log.DownstreamStatus) return null;
      return {
        time: (log.StartUTC as string) ?? (log.time as string) ?? new Date().toISOString(),
        method: (log.RequestMethod as string) ?? "GET",
        host: (log.RequestHost as string) ?? "",
        path: (log.RequestPath as string) ?? "/",
        status: Number(log.DownstreamStatus ?? 0),
        durationMs: Math.round(Number(log.Duration ?? 0) / 1e6),
      };
    } catch {
      return null;
    }
  }

  private simulated(host?: string): RequestEntry[] {
    const h = host ?? "app.capiva.test";
    const rows: Array<[string, string, number, number]> = [
      ["GET", "/", 200, 12],
      ["GET", "/api/health", 200, 3],
      ["POST", "/api/orders", 201, 48],
      ["GET", "/api/orders/42", 200, 19],
      ["GET", "/static/app.js", 200, 7],
      ["POST", "/api/login", 401, 33],
      ["GET", "/api/reports", 500, 812],
    ];
    const now = Date.now();
    return rows.map(([method, path, status, durationMs], i) => ({
      time: new Date(now - i * 4000).toISOString(),
      method,
      host: h,
      path,
      status,
      durationMs,
    }));
  }
}
