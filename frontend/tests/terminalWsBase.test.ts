/**
 * URL base do WebSocket do terminal. No deploy o nginx faz proxy de /terminal/ na
 * mesma origem do painel, então a imagem publicada funciona em qualquer host sem
 * gravar o endereço no build.
 */
import { describe, expect, it } from "bun:test";
import { resolveTerminalWsBase } from "@/lib/terminalWs";

describe("resolveTerminalWsBase", () => {
  it("URL explícita vence", () => {
    expect(
      resolveTerminalWsBase({
        explicit: "wss://term.exemplo.com/",
        apiUrl: "",
        origin: "https://painel.exemplo.com",
      }),
    ).toBe("wss://term.exemplo.com");
  });

  it("API na mesma origem (deploy com nginx): WebSocket na mesma origem", () => {
    expect(
      resolveTerminalWsBase({ explicit: "", apiUrl: "", origin: "http://10.1.2.8:8410" }),
    ).toBe("ws://10.1.2.8:8410");
    expect(
      resolveTerminalWsBase({ explicit: "", apiUrl: "", origin: "https://painel.exemplo.com" }),
    ).toBe("wss://painel.exemplo.com");
  });

  it("API em outra origem (dev): porta dedicada, a da API mais um", () => {
    expect(
      resolveTerminalWsBase({
        explicit: "",
        apiUrl: "http://localhost:3000",
        origin: "http://localhost:5173",
      }),
    ).toBe("ws://localhost:3001");
  });

  it("API inválida cai no padrão local", () => {
    expect(
      resolveTerminalWsBase({ explicit: "", apiUrl: "::", origin: "http://localhost:5173" }),
    ).toBe("ws://localhost:3001");
  });
});
