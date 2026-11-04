import { useAuthStore } from "@/stores/useAuthStore";

const BASE = import.meta.env.VITE_API_URL || "";

interface ApiOptions extends RequestInit {
  auth?: boolean;
}

/**
 * Cliente HTTP central. Anexa o access token (em memória) e, em 401, tenta um
 * refresh transparente (cookie HttpOnly enviado automaticamente) e refaz a request.
 * Os serviços/hooks usam este client — nunca fetch direto nas páginas.
 */
async function send(path: string, options: ApiOptions = {}, retry = true): Promise<Response> {
  const { auth = true, headers, ...rest } = options;
  const store = useAuthStore.getState();

  const res = await fetch(`${BASE}/api${path}`, {
    ...rest,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(auth && store.accessToken ? { Authorization: `Bearer ${store.accessToken}` } : {}),
      ...(store.organizationId ? { "x-organization-id": store.organizationId } : {}),
      ...headers,
    },
  });

  if (res.status === 401 && retry && auth) {
    const refreshed = await tryRefresh();
    if (refreshed) return send(path, options, false);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body?.message || res.statusText, body);
  }
  return res;
}

async function request<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const res = await send(path, options);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** Nome do arquivo vindo do `Content-Disposition`, quando o servidor manda. */
const fileNameOf = (res: Response, fallback: string): string =>
  /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? fallback;

/** Baixa um arquivo autenticado (mesmo token/refresh das outras chamadas). */
async function download(path: string, fallbackName: string): Promise<void> {
  const res = await send(path, { method: "GET" });
  const url = URL.createObjectURL(await res.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileNameOf(res, fallbackName);
  anchor.click();
  URL.revokeObjectURL(url);
}

async function tryRefresh(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/auth/refresh`, { method: "POST", credentials: "include" });
    if (!res.ok) {
      useAuthStore.getState().clear();
      return false;
    }
    const data = (await res.json()) as { accessToken: string; user: any };
    useAuthStore.getState().setAuth(data.accessToken, data.user);
    return true;
  } catch {
    return false;
  }
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
  }
}

export const api = {
  get: <T>(path: string, opts?: ApiOptions) => request<T>(path, { ...opts, method: "GET" }),
  post: <T>(path: string, body?: unknown, opts?: ApiOptions) =>
    request<T>(path, { ...opts, method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown, opts?: ApiOptions) =>
    request<T>(path, { ...opts, method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown, opts?: ApiOptions) =>
    request<T>(path, { ...opts, method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string, opts?: ApiOptions) => request<T>(path, { ...opts, method: "DELETE" }),
  download,
};
