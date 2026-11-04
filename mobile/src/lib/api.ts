import { useAuthStore } from "@/stores/useAuthStore";

interface ApiOptions extends RequestInit {
  auth?: boolean;
}

/**
 * Cliente HTTP central (espelho do painel web). Anexa o access token (em
 * memória) e, em 401, tenta um refresh transparente (cookie gerenciado pelo
 * runtime nativo) e refaz a request. A base vem da URL do servidor informada
 * no login (self-hosted). Hooks usam este client — nunca fetch direto em telas.
 */
async function request<T>(path: string, options: ApiOptions = {}, retry = true): Promise<T> {
  const { auth = true, headers, ...rest } = options;
  const store = useAuthStore.getState();
  if (!store.serverUrl) throw new ApiError(0, "Servidor não configurado.");

  const res = await fetch(`${store.serverUrl}/api${path}`, {
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
    if (refreshed) return request<T>(path, options, false);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { message?: string });
    throw new ApiError(res.status, (body as { message?: string })?.message || res.statusText, body);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function tryRefresh(): Promise<boolean> {
  const { serverUrl } = useAuthStore.getState();
  if (!serverUrl) return false;
  try {
    const res = await fetch(`${serverUrl}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) {
      useAuthStore.getState().clear();
      return false;
    }
    const data = (await res.json()) as {
      accessToken: string;
      user: { id: string; email: string; name: string };
    };
    useAuthStore.getState().setAuth(data.accessToken, data.user);
    return true;
  } catch {
    return false;
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
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
};
