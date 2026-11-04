import { Injectable } from "@di/index";
import { UptimeRepository, type UptimeCheckWithOwner } from "@repository/UptimeRepository";
import { NotificationService } from "@service/NotificationService";
import { withTransaction } from "@database/withTransaction";
import { HttpError } from "@functions/HttpError";
import { uptimeEventFor } from "@functions/stateTransition";
import { buildUptimeMessage } from "@functions/alertMessages";
import type { UptimeCheck } from "@prisma-generated/client";

export interface CreateUptimeCheckInput {
  url: string;
  intervalSec?: number;
  enabled?: boolean;
}

interface UptimeSample {
  ok: boolean;
  statusCode?: number;
  latencyMs: number;
}

/** Sonda HTTP com timeout de 10s. 5xx e falta de resposta contam como fora do ar. */
async function probe(url: string): Promise<UptimeSample> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: "follow" });
    return { ok: res.status < 500, statusCode: res.status, latencyMs: Date.now() - started };
  } catch {
    return { ok: false, latencyMs: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Uptime checks: sondas HTTP nos domínios das aplicações. O scheduler chama
 * `runAllDue` periodicamente; cada sonda grava um UptimeResult (ok/status/latência)
 * e, quando o estado muda em relação à amostra anterior, dispara `downtime` ou
 * `recovery` (nunca a cada amostra).
 */
@Injectable()
export class UptimeService {
  constructor(
    private readonly uptime: UptimeRepository,
    private readonly notifications: NotificationService,
  ) {}

  listChecks(applicationId: string, tenant: { organizationId: string }): Promise<UptimeCheck[]> {
    return withTransaction(() => this.uptime.listChecks(applicationId), { tenant });
  }

  createCheck(applicationId: string, input: CreateUptimeCheckInput, tenant: { organizationId: string }): Promise<UptimeCheck> {
    return withTransaction(
      () => this.uptime.createCheck({ applicationId, url: input.url, intervalSec: input.intervalSec ?? 60, enabled: input.enabled ?? true }),
      { tenant },
    );
  }

  async removeCheck(checkId: string, tenant: { organizationId: string }): Promise<void> {
    await withTransaction(() => this.uptime.deleteCheck(checkId), { tenant });
  }

  /** Sonda uma URL, grava o resultado e notifica a transição de estado. */
  async runCheck(check: UptimeCheckWithOwner): Promise<void> {
    const sample = await probe(check.url);
    const recorded = await withTransaction(async () => {
      const [previous] = await this.uptime.recentResults(check.id, 1);
      await this.uptime.recordResult({ uptimeCheckId: check.id, ...sample });
      return { previousOk: previous?.ok };
    }, {}).catch(() => null);

    // Sem gravar não há histórico confiável: notificar agora repetiria o aviso.
    if (!recorded) return;
    const event = uptimeEventFor(recorded.previousOk, sample.ok);
    if (!event) return;
    const message = buildUptimeMessage(event, { app: check.application.name, url: check.url, ...sample });
    await this.notifications.dispatch(check.application.project.organizationId, message);
  }

  /** Executa todas as verificações habilitadas (chamado pelo scheduler). */
  async runAllDue(): Promise<number> {
    const checks = await withTransaction(() => this.uptime.listEnabled(), {}).catch(() => [] as UptimeCheckWithOwner[]);
    await Promise.all(checks.map((c) => this.runCheck(c).catch(() => undefined)));
    return checks.length;
  }

  /** Sonda manual de uma verificação específica. */
  async runNow(checkId: string, tenant: { organizationId: string }): Promise<void> {
    const check = await withTransaction(() => this.uptime.findCheck(checkId), { tenant });
    if (!check) throw HttpError.notFound("Verificação não encontrada.");
    await this.runCheck(check);
  }
}
