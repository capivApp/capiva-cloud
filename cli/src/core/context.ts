import type { ApiClient } from "@core/api";
import type { ParsedArgs } from "@core/args";
import type { CliEnv, ConfigStore } from "@core/config";

/** Tudo o que a CLI toca no mundo de fora, injetado (testes trocam por fakes). */
export interface CliDeps {
  fetch: typeof fetch;
  env: CliEnv;
  stdout(text: string): void;
  stderr(text: string): void;
  cwd: string;
  prompt(question: string): string | null;
  configStore: ConfigStore;
  files: {
    exists(path: string): Promise<boolean>;
    write(path: string, content: string): Promise<void>;
  };
}

export interface Output {
  line(text?: string): void;
  error(text: string): void;
  /** `--json` imprime o dado; senão, o texto legível. */
  result(data: unknown, human: () => string): void;
}

export interface CommandContext {
  /** Posicionais DEPOIS das palavras do comando (ex.: `deploy api` → `["api"]`). */
  args: string[];
  flags: ParsedArgs["flags"];
  deps: CliDeps;
  out: Output;
  /** Cliente autenticado. Falha com "rode capiva login" quando não há credenciais. */
  api(): Promise<ApiClient>;
}

/** Strategy de comando: cada comando é um objeto registrado no mapa. */
export interface CommandStrategy {
  readonly usage: string;
  readonly summary: string;
  run(ctx: CommandContext): Promise<number | void>;
}

export const createOutput = (deps: CliDeps, json: boolean): Output => ({
  line: (text = "") => deps.stdout(`${text}\n`),
  error: (text) => deps.stderr(`${text}\n`),
  result: (data, human) => deps.stdout(`${json ? JSON.stringify(data, null, 2) : human()}\n`),
});
