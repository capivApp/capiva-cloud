/**
 * Link do status de commit no Git (`/applications/:id?deployment=:deploymentId`): a tela
 * abre na aba Deploys com aquele deploy destacado. Funções puras, sem React.
 *
 * Rodar com `bun test` dentro de `frontend/`.
 */
import { describe, expect, it } from "bun:test";
import { isDeploymentDestacado, readApplicationTab, readDeploymentDestacado, writeApplicationTab } from "@/pages/applications/detail/deploymentLink";

const params = (qs: string) => new URLSearchParams(qs);

describe("readApplicationTab", () => {
  it("sem nada na URL abre em Deploys", () => {
    expect(readApplicationTab(params(""))).toBe("deploys");
  });

  it("respeita a aba gravada na URL", () => {
    expect(readApplicationTab(params("tab=logs"))).toBe("logs");
  });

  it("link de um deploy abre em Deploys, mesmo com outra aba na URL", () => {
    expect(readApplicationTab(params("deployment=dep_1"))).toBe("deploys");
    expect(readApplicationTab(params("tab=logs&deployment=dep_1"))).toBe("deploys");
  });
});

describe("readDeploymentDestacado", () => {
  it("lê o deploy do link", () => {
    expect(readDeploymentDestacado(params("deployment=dep_1"))).toBe("dep_1");
  });

  it("sem deploy no link, nada fica destacado", () => {
    expect(readDeploymentDestacado(params("tab=deploys"))).toBeNull();
    expect(readDeploymentDestacado(params("deployment="))).toBeNull();
  });
});

describe("isDeploymentDestacado", () => {
  it("só o deploy do link fica destacado", () => {
    expect(isDeploymentDestacado("dep_1", "dep_1")).toBe(true);
    expect(isDeploymentDestacado("dep_2", "dep_1")).toBe(false);
    expect(isDeploymentDestacado("dep_1", null)).toBe(false);
  });
});

describe("writeApplicationTab", () => {
  it("troca a aba e solta o deploy do link, preservando o resto", () => {
    const next = writeApplicationTab(params("deployment=dep_1&level=error"), "logs");
    expect(next.get("tab")).toBe("logs");
    expect(next.get("deployment")).toBeNull();
    expect(next.get("level")).toBe("error");
  });
});
