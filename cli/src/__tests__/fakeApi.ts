/**
 * API falsa para os testes de comando: rotas "MÉTODO /caminho" (sem o prefixo /api)
 * e saída capturada. Nada de rede nem de disco do usuário.
 */
import type { CliDeps } from "@core/context";
import type { StoredCredentials } from "@core/config";

export type FakeHandler = (body: unknown) => unknown;

export interface FakeCall {
  method: string;
  path: string;
  body: unknown;
  headers: Record<string, string>;
}

export const sseResponse = (events: { event: string; data: unknown }[]): Response => {
  const text = events.map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`).join("");
  return new Response(text, { headers: { "Content-Type": "text/event-stream" } });
};

export const PROJECTS = [{ id: "p1", name: "loja" }];

export const APPS = [
  {
    id: "a1",
    name: "api",
    projectId: "p1",
    source: "GITHUB",
    observedStatus: "running",
    port: 8080,
    profile: "SMALL",
    sourceConfig: { repo: "org/loja", branch: "main", dockerfile: "Dockerfile.prod", subPath: "apps/api", healthPath: "/health", buildArgs: [{ key: "NODE_ENV", value: "production" }] },
  },
  { id: "a2", name: "web", projectId: "p1", source: "DOCKER_IMAGE", observedStatus: "stopped", port: 80, profile: "NANO", sourceConfig: { image: "nginx:1" } },
];

export const DEPLOYMENTS = [
  { id: "d3", version: "abc1234", status: "HEALTHY", imageRef: "r/api:abc1234", startedAt: "2026-11-04T12:00:00Z" },
  { id: "d2", version: "fff0000", status: "FAILED", imageRef: null, startedAt: "2026-11-03T12:00:00Z" },
  { id: "d1", version: "0001111", status: "HEALTHY", imageRef: "r/api:0001111", startedAt: "2026-11-02T12:00:00Z" },
];

export const BASE_ROUTES: Record<string, FakeHandler> = {
  "GET /projects": () => PROJECTS,
  "GET /applications?projectId=p1": () => APPS,
  "GET /applications/a1": () => APPS[0],
  "GET /applications/a1/deployments": () => DEPLOYMENTS,
};

export function makeDeps(routes: Record<string, FakeHandler> = {}, options: { credentials?: StoredCredentials | null; files?: Record<string, string>; env?: Record<string, string> } = {}) {
  const all = { ...BASE_ROUTES, ...routes };
  const calls: FakeCall[] = [];
  const stdout: string[] = [];
  const stderr: string[] = [];
  const files: Record<string, string> = { ...(options.files ?? {}) };
  let saved: StoredCredentials | null = options.credentials === undefined ? { token: "cap_test", apiUrl: "https://capiva.test" } : options.credentials;

  const fetchFn = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : input);
    const path = `${url.pathname.replace(/^\/api/, "")}${url.search}`;
    const method = init?.method ?? "GET";
    // O cliente da CLI sempre manda o corpo como JSON em string.
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ method, path, body, headers: (init?.headers ?? {}) as Record<string, string> });
    const handler = all[`${method} ${path}`];
    if (!handler) return Response.json({ error: "NOT_FOUND", message: `Rota falsa ausente: ${method} ${path}` }, { status: 404 });
    const result = handler(body);
    if (result instanceof Response) return result;
    if (result === null) return new Response(null, { status: 204 });
    return Response.json(result);
  };

  const deps: CliDeps = {
    fetch: fetchFn as typeof fetch,
    env: options.env ?? {},
    stdout: (text) => stdout.push(text),
    stderr: (text) => stderr.push(text),
    cwd: "/projeto",
    prompt: () => null,
    configStore: {
      path: "/home/u/.config/capiva/config.json",
      load: async () => saved,
      save: async (credentials) => {
        saved = credentials;
      },
    },
    files: {
      exists: async (path) => path in files,
      write: async (path, content) => {
        files[path] = content;
      },
    },
  };

  return { deps, calls, stdout, stderr, files, saved: () => saved };
}
