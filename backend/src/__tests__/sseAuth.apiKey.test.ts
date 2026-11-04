/**
 * Streams SSE aceitam chave de API `cap_` no header Authorization (CLI: `deploy
 * --wait`, `logs -f`). ApiKeyService mockado via container, sem banco.
 */
import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import type { Request, Response } from "express";
import { container } from "@di/index";
import { ApiKeyService } from "@service/ApiKeyService";
import { sseAuthMiddleware } from "@middleware/auth";
import { HttpError } from "@functions/HttpError";

const makeReq = (authorization: string) => ({ headers: { authorization }, query: {} }) as unknown as Request;

let restore: (() => void) | undefined;
afterEach(() => restore?.());

describe("sseAuthMiddleware com chave de API", () => {
  it("autentica `cap_` e fixa a organização da chave", async () => {
    const spy = spyOn(container.get(ApiKeyService), "verify").mockResolvedValue({ keyId: "k1", organizationId: "org1", role: "DEVELOPER", name: "cli" });
    restore = () => spy.mockRestore();
    const req = makeReq("Bearer cap_abc_def");
    const next = mock((_error?: unknown) => undefined);

    await sseAuthMiddleware(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.organizationId).toBe("org1");
    expect(req.headers["x-organization-id"]).toBe("org1");
  });

  it("recusa chave inexistente", async () => {
    const spy = spyOn(container.get(ApiKeyService), "verify").mockResolvedValue(null);
    restore = () => spy.mockRestore();
    const next = mock((_error?: unknown) => undefined);

    await sseAuthMiddleware(makeReq("Bearer cap_xxx"), {} as Response, next);

    const error = next.mock.calls[0]?.[0] as HttpError;
    expect(error).toBeInstanceOf(HttpError);
    expect(error.status).toBe(401);
  });
});
