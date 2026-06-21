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
async function request<T>(path: string, options: ApiOptions = {}, retry = true): Promise<T> {
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
    if (refreshed) return request<T>(path, options, false);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body?.message || res.statusText, body);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
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
};
