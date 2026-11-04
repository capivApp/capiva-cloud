import { COMMANDS } from "@command/registry";
import { createApiClient, type ApiClient } from "@core/api";
import { parseArgs } from "@core/args";
import { resolveCredentials } from "@core/config";
import { CliError } from "@core/errors";
import {
  createOutput,
  type CliDeps,
  type CommandContext,
  type CommandStrategy,
} from "@core/context";

interface Resolved {
  name: string;
  command: CommandStrategy;
  args: string[];
}

/** Tenta "apps list" antes de "apps": o comando de duas palavras vence. */
const resolveCommand = (positionals: string[]): Resolved | null => {
  const candidates = [positionals.slice(0, 2), positionals.slice(0, 1)].filter(
    (words) => words.length,
  );
  for (const words of candidates) {
    const name = words.join(" ");
    const command = COMMANDS[name];
    if (command) return { name, command, args: positionals.slice(words.length) };
  }
  return null;
};

export const buildHelp = (): string => {
  const entries = Object.values(COMMANDS);
  const width = Math.max(...entries.map((c) => c.usage.length));
  return [
    "capiva: Capiva Cloud pelo terminal",
    "",
    "Uso: capiva <comando> [opções]",
    "",
    ...entries.map((c) => `  ${c.usage.padEnd(width)}  ${c.summary}`),
    "",
    "Opções globais: --json (saída em JSON), --help",
    "Credenciais: capiva login, ou CAPIVA_TOKEN e CAPIVA_API_URL.",
  ].join("\n");
};

const buildContext = (
  deps: CliDeps,
  resolved: Resolved,
  flags: CommandContext["flags"],
): CommandContext => {
  let client: ApiClient | undefined;
  return {
    args: resolved.args,
    flags,
    deps,
    out: createOutput(deps, Boolean(flags.json)),
    async api() {
      client ??= createApiClient(
        resolveCredentials(deps.env, await deps.configStore.load()),
        deps.fetch,
      );
      return client;
    },
  };
};

const execute = async (argv: string[], deps: CliDeps): Promise<number> => {
  const { positionals, flags } = parseArgs(argv);
  if (!positionals.length || flags.help) {
    deps.stdout(`${buildHelp()}\n`);
    return 0;
  }
  const resolved = resolveCommand(positionals);
  if (!resolved)
    throw new CliError(`Comando desconhecido: ${positionals.join(" ")}. Veja capiva --help.`, 2);
  const code = await resolved.command.run(buildContext(deps, resolved, flags));
  return typeof code === "number" ? code : 0;
};

/** Ponto de entrada testável: devolve o código de saída em vez de chamar process.exit. */
export async function runCli(argv: string[], deps: CliDeps): Promise<number> {
  try {
    return await execute(argv, deps);
  } catch (error) {
    if (!(error instanceof CliError)) throw error;
    deps.stderr(`erro: ${error.message}\n`);
    return error.exitCode;
  }
}
