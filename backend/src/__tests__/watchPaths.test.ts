import { describe, expect, it } from "bun:test";
import { matchesWatchPaths } from "@service/GitService";

describe("matchesWatchPaths", () => {
  it("sem configuração, qualquer push dispara (comportamento anterior)", () => {
    expect(matchesWatchPaths(undefined, ["README.md"])).toBe(true);
    expect(matchesWatchPaths([], ["README.md"])).toBe(true);
  });

  it("dispara quando o push toca um caminho observado", () => {
    expect(matchesWatchPaths(["apps/api"], ["apps/api/src/index.ts"])).toBe(true);
    expect(matchesWatchPaths(["apps/api", "packages/shared"], ["packages/shared/util.ts"])).toBe(
      true,
    );
  });

  it("ignora push que não toca nenhum caminho observado", () => {
    expect(matchesWatchPaths(["apps/api"], ["apps/web/page.tsx", "README.md"])).toBe(false);
  });

  // "apps/api" não deve casar com "apps/api-legacy": o prefixo é por segmento.
  it("compara por segmento de caminho, não por prefixo de texto", () => {
    expect(matchesWatchPaths(["apps/api"], ["apps/api-legacy/src/main.ts"])).toBe(false);
    expect(matchesWatchPaths(["apps/api"], ["apps/api"])).toBe(true);
  });

  it("normaliza barras iniciais e finais na configuração", () => {
    expect(matchesWatchPaths(["./apps/api/", "/packages/ui"], ["apps/api/src/a.ts"])).toBe(true);
    expect(matchesWatchPaths(["./apps/api/"], ["packages/ui/b.ts"])).toBe(false);
  });

  // Provedores truncam a lista de arquivos em pushes grandes; perder um deploy
  // é pior do que rodar um build a mais.
  it("dispara quando o payload não informa arquivos alterados", () => {
    expect(matchesWatchPaths(["apps/api"], [])).toBe(true);
    expect(matchesWatchPaths(["apps/api"], undefined)).toBe(true);
  });
});
