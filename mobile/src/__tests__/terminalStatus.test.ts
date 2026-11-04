/// <reference types="bun" />
/**
 * Status exibido pelo terminal: derivado da conexão vigente, sem setState no efeito.
 * Função pura, sem WebSocket.
 */
import { describe, expect, test } from "bun:test";
import { buildConnectionKey, resolveTerminalStatus } from "@/lib/terminalStatus";

describe("resolveTerminalStatus", () => {
  test("conexão vigente devolve o status registrado", () => {
    const key = buildConnectionKey("/terminal/nodes/1", 0, 80);
    expect(resolveTerminalStatus({ key, status: "open" }, key)).toBe("open");
    expect(resolveTerminalStatus({ key, status: "closed" }, key)).toBe("closed");
  });

  test("conexão nova (reconectar, outro alvo, outra largura) começa conectando", () => {
    const antiga = buildConnectionKey("/terminal/nodes/1", 0, 80);
    const reconectada = buildConnectionKey("/terminal/nodes/1", 1, 80);
    const girada = buildConnectionKey("/terminal/nodes/1", 0, 120);
    expect(resolveTerminalStatus({ key: antiga, status: "closed" }, reconectada)).toBe("connecting");
    expect(resolveTerminalStatus({ key: antiga, status: "open" }, girada)).toBe("connecting");
  });
});
