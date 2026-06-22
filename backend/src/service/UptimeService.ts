import { Injectable } from "@di/index";
import { UptimeRepository } from "@repository/UptimeRepository";
import { withTransaction } from "@database/withTransaction";
import { HttpError } from "@functions/HttpError";
import type { UptimeCheck } from "@prisma-generated/client";

export interface CreateUptimeCheckInput {
  url: string;
  intervalSec?: number;
  enabled?: boolean;
}

/**
 * Uptime checks: sondas HTTP nos domínios das aplicações. O scheduler chama
 * `runAllDue` periodicamente; cada sonda grava um UptimeResult (ok/status/latência).
 */
@Injectable()
export class UptimeService {
  constructor(private readonly uptime: UptimeRepository) {}

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

  /** Sonda uma URL e grava o resultado. */
  async runCheck(check: UptimeCheck): Promise<void> {
    const started = Date.now();
    let ok = false;
    let statusCode: number | undefined;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      const res = await fetch(check.url, { signal: controller.signal, redirect: "follow" });
      clearTimeout(timer);
      statusCode = res.status;
      ok = res.status < 500;
    } catch {
      ok = false;
    }
    const latencyMs = Date.now() - started;
    await withTransaction(() => this.uptime.recordResult({ uptimeCheckId: check.id, ok, statusCode, latencyMs }), {}).catch(() => undefined);
  }

  /** Executa todas as verificações habilitadas (chamado pelo scheduler). */
  async runAllDue(): Promise<number> {
    const checks = await withTransaction(() => this.uptime.listEnabled(), {}).catch(() => [] as UptimeCheck[]);
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
