import { describe, expect, it } from "bun:test";
import { cronMatches } from "@infra/scheduler/cron";

// Datas locais (mês 0-based no construtor do Date).
const at = (y: number, mo: number, d: number, h: number, mi: number) => new Date(y, mo - 1, d, h, mi);

describe("cronMatches", () => {
  it("'0 3 * * *' casa às 03:00 e não às 03:01 nem 04:00", () => {
    expect(cronMatches("0 3 * * *", at(2026, 6, 21, 3, 0))).toBe(true);
    expect(cronMatches("0 3 * * *", at(2026, 6, 21, 3, 1))).toBe(false);
    expect(cronMatches("0 3 * * *", at(2026, 6, 21, 4, 0))).toBe(false);
  });

  it("'*/15 * * * *' casa em 0,15,30,45", () => {
    for (const m of [0, 15, 30, 45]) expect(cronMatches("*/15 * * * *", at(2026, 6, 21, 10, m))).toBe(true);
    for (const m of [1, 14, 31]) expect(cronMatches("*/15 * * * *", at(2026, 6, 21, 10, m))).toBe(false);
  });

  it("listas e intervalos: '0 9-17/4 * * 1-5'", () => {
    // 21/06/2026 é domingo (dow=0) → fora de 1-5.
    expect(cronMatches("0 9-17/4 * * 1-5", at(2026, 6, 21, 9, 0))).toBe(false);
    // 22/06/2026 é segunda (dow=1); horas válidas 9,13,17.
    expect(cronMatches("0 9-17/4 * * 1-5", at(2026, 6, 22, 13, 0))).toBe(true);
    expect(cronMatches("0 9-17/4 * * 1-5", at(2026, 6, 22, 10, 0))).toBe(false);
  });

  it("domingo aceita tanto 0 quanto 7", () => {
    expect(cronMatches("0 0 * * 0", at(2026, 6, 21, 0, 0))).toBe(true);
    expect(cronMatches("0 0 * * 7", at(2026, 6, 21, 0, 0))).toBe(true);
  });

  it("expressão inválida lança", () => {
    expect(() => cronMatches("0 3 * *", new Date())).toThrow();
  });
});
