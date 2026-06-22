import "reflect-metadata";
import { config } from "./config";
import { noAwaitedFunction } from "@functions/noAwaitedFunction";
import { bootstrapRegistry } from "./bootstrap/registry";
import { startUptimeScheduler } from "@infra/scheduler/uptimeScheduler";
import { startDatabaseBackupScheduler } from "@infra/scheduler/databaseBackupScheduler";
import { startTerminalGateway } from "@infra/realtime/TerminalGateway";
import HttpServer from "./http/server";

async function main(): Promise<void> {
  try {
    await bootstrapRegistry();
    const server = new HttpServer(config.port);
    await server.init();
    startUptimeScheduler();
    startDatabaseBackupScheduler();
    startTerminalGateway(config.terminalPort);

    process.on("SIGINT", async () => {
      await server.stop();
      process.exit(0);
    });
  } catch (error) {
    console.error("Falha ao iniciar o servidor:", error);
    process.exit(1);
  }
}

noAwaitedFunction(main());
