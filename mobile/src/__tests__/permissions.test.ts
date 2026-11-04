/// <reference types="bun" />
/**
 * Permissões das ações da aplicação por papel (espelho do RBAC do backend:
 * mutações exigem DEVELOPER+). Função pura, sem rede.
 */
import { describe, expect, test } from "bun:test";
import { ACOES_APLICACAO, buildPermissoesDaAplicacao, type PermissoesDaAplicacao } from "@/lib/permissions";

const todas = (valor: boolean) => Object.fromEntries(ACOES_APLICACAO.map((acao) => [acao, valor])) as PermissoesDaAplicacao;

describe("buildPermissoesDaAplicacao", () => {
  test("VIEWER não opera nada", () => {
    expect(buildPermissoesDaAplicacao("VIEWER")).toEqual(todas(false));
  });

  test.each(["DEVELOPER", "ADMIN", "OWNER"] as const)("%s opera todas as ações", (role) => {
    expect(buildPermissoesDaAplicacao(role)).toEqual(todas(true));
  });

  test("papel ainda não carregado bloqueia tudo", () => {
    expect(buildPermissoesDaAplicacao(null)).toEqual(todas(false));
    expect(buildPermissoesDaAplicacao(undefined)).toEqual(todas(false));
  });

  test("papel desconhecido bloqueia tudo", () => {
    expect(buildPermissoesDaAplicacao("GUEST")).toEqual(todas(false));
  });

  test("cobre redeploy, rollback, escala, restart e ciclo de vida", () => {
    expect([...ACOES_APLICACAO].sort()).toEqual(["lifecycle", "redeploy", "restart", "rollback", "scale"]);
  });
});
