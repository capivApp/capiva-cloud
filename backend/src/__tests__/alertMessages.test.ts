/**
 * Texto das notificações de alerta e de uptime: curto, em português e sem
 * travessão. Funções puras.
 */
import { describe, expect, it } from "bun:test";
import { buildAlertMessage, buildUptimeMessage } from "@functions/alertMessages";

const rule = { metric: "CPU" as const, operator: "GT" as const, threshold: 80, windowMinutes: 5 };

describe("buildAlertMessage", () => {
  it("alerta disparado diz a métrica, o valor e o limite", () => {
    const m = buildAlertMessage("alert.triggered", { app: "api", rule, value: 93.456 });
    expect(m.event).toBe("alert.triggered");
    expect(m.title).toBe("Alerta: CPU de api");
    expect(m.body).toBe("CPU em 93.5%, acima de 80% nos últimos 5 min.");
  });

  it("alerta resolvido diz o valor atual", () => {
    const m = buildAlertMessage("alert.resolved", {
      app: "api",
      rule: { ...rule, metric: "LATENCY_P95", threshold: 500 },
      value: 120,
    });
    expect(m.title).toBe("Alerta resolvido: Latência p95 de api");
    expect(m.body).toBe("Latência p95 voltou para 120 ms. Limite: 500 ms.");
  });
});

describe("buildUptimeMessage", () => {
  it("downtime cita a URL e o status", () => {
    const m = buildUptimeMessage("downtime", { app: "api", url: "https://api.x", statusCode: 503 });
    expect(m).toEqual({
      event: "downtime",
      title: "Aplicação fora do ar: api",
      body: "https://api.x respondeu 503.",
    });
  });

  it("downtime sem resposta", () => {
    expect(buildUptimeMessage("downtime", { app: "api", url: "https://api.x" }).body).toBe(
      "https://api.x não respondeu.",
    );
  });

  it("recovery avisa a volta", () => {
    const m = buildUptimeMessage("recovery", {
      app: "api",
      url: "https://api.x",
      statusCode: 200,
      latencyMs: 87,
    });
    expect(m).toEqual({
      event: "recovery",
      title: "Aplicação de volta: api",
      body: "https://api.x voltou a responder (200 em 87 ms).",
    });
  });

  it("nenhum texto leva travessão", () => {
    const all = [
      buildAlertMessage("alert.triggered", { app: "a", rule, value: 1 }),
      buildAlertMessage("alert.resolved", { app: "a", rule, value: 1 }),
      buildUptimeMessage("downtime", { app: "a", url: "u" }),
      buildUptimeMessage("recovery", { app: "a", url: "u", statusCode: 200, latencyMs: 1 }),
    ];
    for (const m of all) expect(`${m.title} ${m.body}`).not.toContain("—");
  });
});
