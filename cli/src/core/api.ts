import { CliError } from "@core/errors";
import type { StoredCredentials } from "@core/config";

export interface ApiClient {
  readonly apiUrl: string;
  get<T = unknown>(path: string): Promise<T>;
  post<T = unknown>(path: string, body?: unknown): Promise<T>;
  put<T = unknown>(path: string, body?: unknown): Promise<T>;
  delete<T = unknown>(path: string): Promise<T>;
  /** Abre um stream SSE (`/api/streams/...`) com a mesma chave. */
  stream(path: string, signal?: AbortSignal): Promise<Response>;
}

interface ErrorBody {
  message?: string;
  issues?: { path?: (string | number)[]; message?: string }[];
}

const messageOf = async (res: Response): Promise<string> => {
  const body = (await res.json().catch(() => ({}))) as ErrorBody;
  const issue = body.issues?.[0];
  const fromIssue = issue && [issue.path?.join("."), issue.message].filter(Boolean).join(": ");
  return body.message || fromIssue || `A API respondeu ${res.status}.`;
};

const parseBody = async <T>(res: Response): Promise<T> => {
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
};

/** Cliente da API do Capiva: `Authorization: Bearer cap_...` e prefixo `/api`. */
export function createApiClient(credentials: StoredCredentials, fetchFn: typeof fetch): ApiClient {
  const headers = { Authorization: `Bearer ${credentials.token}`, Accept: "application/json" };

  const send = async (
    method: string,
    path: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<Response> => {
    const init: RequestInit = {
      method,
      signal,
      headers: body === undefined ? headers : { ...headers, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    };
    const res = await fetchFn(`${credentials.apiUrl}/api${path}`, init).catch((error: Error) => {
      throw new CliError(`Não foi possível falar com ${credentials.apiUrl}: ${error.message}`);
    });
    if (!res.ok) throw new CliError(await messageOf(res));
    return res;
  };

  return {
    apiUrl: credentials.apiUrl,
    get: (path) => send("GET", path).then(parseBody),
    post: (path, body) => send("POST", path, body ?? {}).then(parseBody),
    put: (path, body) => send("PUT", path, body ?? {}).then(parseBody),
    delete: (path) => send("DELETE", path).then(parseBody),
    stream: (path, signal) => send("GET", path, undefined, signal),
  } as ApiClient;
}
