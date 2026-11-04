import { chmod, mkdir, readFile, writeFile } from "fs/promises";
import { homedir } from "os";
import { dirname, join } from "path";
import { CliError } from "@core/errors";

export interface StoredCredentials {
  token: string;
  apiUrl: string;
}

export interface ConfigStore {
  readonly path: string;
  load(): Promise<StoredCredentials | null>;
  save(credentials: StoredCredentials): Promise<void>;
}

export type CliEnv = Record<string, string | undefined>;

export const normalizeApiUrl = (url: string): string => url.trim().replace(/\/+$/, "");

/** `~/.config/capiva/config.json`, respeitando `XDG_CONFIG_HOME`. */
export const configPathOf = (env: CliEnv): string =>
  join(env.XDG_CONFIG_HOME || join(env.HOME || homedir(), ".config"), "capiva", "config.json");

const readJson = async (path: string): Promise<StoredCredentials | null> => {
  try {
    return JSON.parse(await readFile(path, "utf8")) as StoredCredentials;
  } catch {
    return null;
  }
};

/** Arquivo de config do usuário. A chave é segredo: diretório 700, arquivo 600. */
export function createConfigStore(env: CliEnv): ConfigStore {
  const path = configPathOf(env);
  return {
    path,
    load: () => readJson(path),
    async save(credentials) {
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      await writeFile(path, `${JSON.stringify(credentials, null, 2)}\n`, { mode: 0o600 });
      await chmod(path, 0o600);
    },
  };
}

/** `CAPIVA_TOKEN`/`CAPIVA_API_URL` vencem o arquivo (CI, containers). */
export function resolveCredentials(
  env: CliEnv,
  stored: StoredCredentials | null,
): StoredCredentials {
  const token = env.CAPIVA_TOKEN || stored?.token;
  const apiUrl = env.CAPIVA_API_URL || stored?.apiUrl;
  if (!token || !apiUrl)
    throw new CliError(
      "Sem credenciais. Rode capiva login ou defina CAPIVA_TOKEN e CAPIVA_API_URL.",
    );
  return { token, apiUrl: normalizeApiUrl(apiUrl) };
}
