import "reflect-metadata";
import { config } from "./config";
import { noAwaitedFunction } from "@functions/noAwaitedFunction";
import { bootstrapRegistry } from "./bootstrap/registry";
import HttpServer from "./http/server";

async function main(): Promise<void> {
  try {
    await bootstrapRegistry();
    const server = new HttpServer(config.port);
    await server.init();

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
