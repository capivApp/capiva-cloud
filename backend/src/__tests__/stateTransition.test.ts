/**
 * Detecção de transição de estado (uptime e alertas). Funções puras: o evento
 * sai só quando o estado MUDA, nunca a cada amostra.
 */
import { describe, expect, it } from "bun:test";
import { alertEventFor, detectTransition, uptimeEventFor } from "@functions/stateTransition";

describe("detectTransition", () => {
  it("devolve rising quando passa de falso para verdadeiro", () => {
    expect(detectTransition(false, true)).toBe("rising");
  });

  it("devolve falling quando passa de verdadeiro para falso", () => {
    expect(detectTransition(true, false)).toBe("falling");
  });

  it("estado repetido não é transição", () => {
    expect(detectTransition(true, true)).toBeNull();
    expect(detectTransition(false, false)).toBeNull();
  });
});

describe("uptimeEventFor", () => {
  it("up para down dispara downtime", () => {
    expect(uptimeEventFor(true, false)).toBe("downtime");
  });

  it("down para up dispara recovery", () => {
    expect(uptimeEventFor(false, true)).toBe("recovery");
  });

  it("amostras repetidas não disparam nada", () => {
    expect(uptimeEventFor(true, true)).toBeNull();
    expect(uptimeEventFor(false, false)).toBeNull();
  });

  it("sem histórico, a primeira amostra fora do ar já é downtime", () => {
    expect(uptimeEventFor(undefined, false)).toBe("downtime");
  });

  it("sem histórico, a primeira amostra no ar não é recovery", () => {
    expect(uptimeEventFor(undefined, true)).toBeNull();
  });
});

describe("alertEventFor", () => {
  it("OK para FIRING dispara alert.triggered", () => {
    expect(alertEventFor("OK", "FIRING")).toBe("alert.triggered");
  });

  it("FIRING para OK dispara alert.resolved", () => {
    expect(alertEventFor("FIRING", "OK")).toBe("alert.resolved");
  });

  it("estado mantido não dispara", () => {
    expect(alertEventFor("FIRING", "FIRING")).toBeNull();
    expect(alertEventFor("OK", "OK")).toBeNull();
  });
});
