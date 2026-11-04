/// <reference types="bun" />
/**
 * Regras do histórico de deploys: qual deploy está em andamento (para seguir o
 * SSE) e quais podem ser alvo de rollback. Lista vem do backend ordenada do mais
 * recente para o mais antigo. Funções puras, sem rede.
 */
import { describe, expect, test } from "bun:test";
import { findDeploymentAtivo, findRollbackTargets, isDeploymentAtivo } from "@/lib/deployments";

const deploy = (id: string, status: string, imageRef: string | null = `img:${id}`) => ({
  id,
  version: id,
  status,
  imageRef,
  progress: 0,
  startedAt: "2026-11-04T10:00:00Z",
  finishedAt: null,
});

describe("isDeploymentAtivo", () => {
  test.each(["QUEUED", "BUILDING", "PUSHING", "DEPLOYING"])("%s está em andamento", (status) => {
    expect(isDeploymentAtivo(status)).toBe(true);
  });

  test.each(["HEALTHY", "FAILED", "ROLLED_BACK"])("%s terminou", (status) => {
    expect(isDeploymentAtivo(status)).toBe(false);
  });
});

describe("findDeploymentAtivo", () => {
  test("segue o deploy mais recente quando ele está em andamento", () => {
    expect(findDeploymentAtivo([deploy("d3", "BUILDING"), deploy("d2", "HEALTHY")])?.id).toBe("d3");
  });

  test("ignora deploy antigo travado se o mais recente já terminou", () => {
    expect(findDeploymentAtivo([deploy("d3", "HEALTHY"), deploy("d2", "QUEUED")])).toBeNull();
  });

  test("lista vazia não tem deploy ativo", () => {
    expect(findDeploymentAtivo([])).toBeNull();
  });
});

describe("findRollbackTargets", () => {
  test("oferece só deploys saudáveis com imagem, sem a versão que está no ar", () => {
    const lista = [
      deploy("d5", "FAILED"),
      deploy("d4", "HEALTHY"),
      deploy("d3", "HEALTHY", null),
      deploy("d2", "ROLLED_BACK"),
      deploy("d1", "HEALTHY"),
    ];
    expect(findRollbackTargets(lista).map((d) => d.id)).toEqual(["d1"]);
  });

  test("respeita o limite de itens", () => {
    const lista = ["d6", "d5", "d4", "d3", "d2", "d1"].map((id) => deploy(id, "HEALTHY"));
    expect(findRollbackTargets(lista, 3).map((d) => d.id)).toEqual(["d5", "d4", "d3"]);
  });

  test("sem deploy anterior saudável não há alvo", () => {
    expect(findRollbackTargets([deploy("d1", "HEALTHY")])).toEqual([]);
  });
});
