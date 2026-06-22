import { Injectable } from "@di/index";
import { UptimeRepository } from "@repository/UptimeRepository";
import { withTransaction } from "@database/withTransaction";

export interface UptimeReport {
  checkId: string;
  url: string;
  enabled: boolean;
  samples: number;
  uptimePercent: number;
  downtimeCount: number;
  avgLatencyMs: number;
  lastStatus: "up" | "down" | "unknown";
  lastCheckedAt: string | null;
}

/**
 * Relatórios de disponibilidade por aplicação: % de uptime, quedas e latência
 * média a partir dos UptimeResult coletados pelo scheduler.
 */
@Injectable()
export class ReportService {
  constructor(private readonly uptime: UptimeRepository) {}

  async forApplication(applicationId: string, tenant: { organizationId: string }): Promise<UptimeReport[]> {
    const checks = await withTransaction(() => this.uptime.listChecks(applicationId), { tenant });
    return Promise.all(
      checks.map(async (check) => {
        const results = await withTransaction(() => this.uptime.recentResults(check.id), { tenant });
        const samples = results.length;
        const up = results.filter((r) => r.ok).length;
        const latencies = results.map((r) => r.latencyMs ?? 0).filter((n) => n > 0);
        const avgLatencyMs = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
        const last = results[0];
        return {
          checkId: check.id,
          url: check.url,
          enabled: check.enabled,
          samples,
          uptimePercent: samples ? Math.round((up / samples) * 1000) / 10 : 0,
          downtimeCount: samples - up,
          avgLatencyMs,
          lastStatus: last ? (last.ok ? "up" : "down") : "unknown",
          lastCheckedAt: last ? last.at.toISOString() : null,
        };
      }),
    );
  }
}
