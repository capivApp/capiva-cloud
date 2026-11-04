import "reflect-metadata";
import { assertProductionSecrets, config } from "./config";
import { noAwaitedFunction } from "@functions/noAwaitedFunction";
import { bootstrapRegistry } from "./bootstrap/registry";
import { startPreviewDeployments } from "@bootstrap/previewDeployments";
import { startUptimeScheduler, UPTIME_LOCK } from "@infra/scheduler/uptimeScheduler";
import { startDatabaseBackupScheduler, DB_BACKUP_LOCK } from "@infra/scheduler/databaseBackupScheduler";
import { startAlertScheduler, ALERT_LOCK } from "@infra/scheduler/alertScheduler";
import { startPreviewCleanupScheduler, PREVIEW_CLEANUP_LOCK } from "@infra/scheduler/previewCleanupScheduler";
import { releaseLeadership } from "@infra/scheduler/leaderElection";
import { startTerminalGateway } from "@infra/realtime/TerminalGateway";
import HttpServer from "./http/server";

/**
 * Encerramento gracioso. O Kubernetes e o Docker enviam SIGTERM no rollout —
 * tratar apenas SIGINT (Ctrl+C) fazia toda atualização derrubar requisições em
 * voo. A ordem importa: parar os timers, drenar o HTTP, liberar as leases.
 */
function installShutdownHandlers(server: HttpServer, timers: ReturnType<typeof setInterval>[]): void {
  let closing = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (closing) return;
    closing = true;
    console.log(`[shutdown] ${signal} recebido — encerrando com elegância.`);

    for (const timer of timers) clearInterval(timer);
    await server.stop().catch((e) => console.error("[shutdown] http:", (e as Error).message));
    await releaseLeadership([UPTIME_LOCK, DB_BACKUP_LOCK, ALERT_LOCK, PREVIEW_CLEANUP_LOCK]);

    console.log("[shutdown] concluído.");
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

async function main(): Promise<void> {
  try {
    assertProductionSecrets();
    await bootstrapRegistry();
    const server = new HttpServer(config.port);
    await server.init();
    const timers = [startUptimeScheduler(), startDatabaseBackupScheduler(), startAlertScheduler(), startPreviewCleanupScheduler()];
    startPreviewDeployments();
    startTerminalGateway(config.terminalPort);

    installShutdownHandlers(server, timers);
  } catch (error) {
    console.error("Falha ao iniciar o servidor:", error);
    process.exit(1);
  }
}

noAwaitedFunction(main());
