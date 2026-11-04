/**
 * Rota pública `/schemas/capiva.json` e sua entrada no OpenAPI. Router falso, sem HTTP.
 */
import { describe, expect, it, mock } from "bun:test";
import type { Router } from "express";
import { registry } from "@http/routes/web/schemas/index";
import { buildOpenApiDocument } from "@openapi/document";

describe("/schemas/capiva.json", () => {
  it("serve o JSON Schema do capiva.json", () => {
    const handlers: Record<string, (req: unknown, res: unknown) => void> = {};
    registry({
      get: (path: string, handler: (req: unknown, res: unknown) => void) =>
        (handlers[path] = handler),
    } as unknown as Router);

    const send = mock((_body: string) => undefined);
    const res = { setHeader: mock(() => undefined), type: mock(() => ({ send })) };
    handlers["/capiva.json"]?.({}, res);

    expect(res.type).toHaveBeenCalledWith("application/schema+json");
    expect(JSON.parse(String(send.mock.calls[0]?.[0])).title).toBe("capiva.json");
  });

  it("está documentado no OpenAPI", () => {
    const paths = buildOpenApiDocument().paths as Record<string, unknown>;
    expect(paths["/schemas/capiva.json"]).toBeDefined();
  });
});
