import { appsListCommand, appsStatusCommand } from "@command/apps";
import { deployCommand } from "@command/deploy";
import { envListCommand, envSetCommand, envUnsetCommand } from "@command/env";
import { initCommand } from "@command/init";
import { loginCommand } from "@command/login";
import { logsCommand } from "@command/logs";
import { rollbackCommand } from "@command/rollback";
import type { CommandStrategy } from "@core/context";

/** Mapa de comandos: chave = palavras do comando. Comando novo = uma linha aqui. */
export const COMMANDS: Record<string, CommandStrategy> = {
  login: loginCommand,
  "apps list": appsListCommand,
  "apps status": appsStatusCommand,
  deploy: deployCommand,
  logs: logsCommand,
  "env list": envListCommand,
  "env set": envSetCommand,
  "env unset": envUnsetCommand,
  rollback: rollbackCommand,
  init: initCommand,
};
