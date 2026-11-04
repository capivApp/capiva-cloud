/**
 * `readFile` dos provedores Git: URL de cada API (respeitando `baseUrl`), decodificação
 * do conteúdo base64 e 404 como "arquivo ausente". fetch mockado, sem rede.
 */
import { afterEach, describe, expect, it, mock } from "bun:test";
import { GitHubProvider, GitLabProvider, GiteaProvider } from "@infra/git/providers";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const conteudo = '{ "port": 8080 }';
const base64 = Buffer.from(conteudo, "utf8").toString("base64");

const mockFetch = (status: number, body: unknown) => {
  const fn = mock(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify(body), { status }));
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
};

const urlOf = (fn: ReturnType<typeof mockFetch>) => String(fn.mock.calls[0]?.[0]);

describe("readFile", () => {
  it("GitHub usa a contents API com ref e decodifica base64", async () => {
    const fn = mockFetch(200, { content: base64, encoding: "base64" });
    const provider = new GitHubProvider("tok", "sec", "https://ghe.exemplo.com/api/v3");
    expect(await provider.readFile("org/repo", "abc123", "apps/api/capiva.json")).toBe(conteudo);
    expect(urlOf(fn)).toBe("https://ghe.exemplo.com/api/v3/repos/org/repo/contents/apps/api/capiva.json?ref=abc123");
  });

  it("GitLab usa a repository files API com projeto e caminho codificados", async () => {
    const fn = mockFetch(200, { content: base64, encoding: "base64" });
    const provider = new GitLabProvider("tok", "sec", "https://gitlab.exemplo.com");
    expect(await provider.readFile("grupo/repo", "main", "apps/api/capiva.json")).toBe(conteudo);
    expect(urlOf(fn)).toBe("https://gitlab.exemplo.com/api/v4/projects/grupo%2Frepo/repository/files/apps%2Fapi%2Fcapiva.json?ref=main");
  });

  it("Gitea usa a contents API", async () => {
    const fn = mockFetch(200, { content: base64, encoding: "base64" });
    const provider = new GiteaProvider("tok", "sec", "https://gitea.exemplo.com");
    expect(await provider.readFile("org/repo", "main", "capiva.json")).toBe(conteudo);
    expect(urlOf(fn)).toBe("https://gitea.exemplo.com/api/v1/repos/org/repo/contents/capiva.json?ref=main");
  });

  it("404 significa arquivo ausente", async () => {
    mockFetch(404, { message: "Not Found" });
    const provider = new GitHubProvider("tok", "sec", "https://api.github.com");
    expect(await provider.readFile("org/repo", "main", "capiva.json")).toBeNull();
  });

  it("outro erro da API é propagado", async () => {
    mockFetch(500, { message: "boom" });
    const provider = new GiteaProvider("tok", "sec", "https://gitea.com");
    expect(provider.readFile("org/repo", "main", "capiva.json")).rejects.toThrow(/500/);
  });
});
