/**
 * RBAC das ações que o app mobile oferece (redeploy, rollback, restart, escala):
 * todas passam por `requireRole("DEVELOPER")`, então VIEWER recebe 403. Request
 * montado à mão, sem banco.
 */
import { describe, expect, it } from "bun:test";
import type { NextFunction, Request, Response } from "express";
import { requireRole } from "@middleware/rbac";
import type { Role } from "@prisma-generated/client";
import { HttpError } from "@functions/HttpError";

const runAs = async (role: Role): Promise<unknown> => {
  const req = {
    auth: { sub: "u1" },
    params: {},
    organizationId: "org-1",
    organizationRole: role,
  } as unknown as Request;
  let received: unknown = "não chamou next";
  const next: NextFunction = (error?: unknown) => {
    received = error;
  };
  await requireRole("DEVELOPER")(req, {} as Response, next);
  return received;
};

describe("requireRole(DEVELOPER) nas ações da aplicação", () => {
  it("VIEWER é barrado com 403", async () => {
    const error = await runAs("VIEWER");
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).status).toBe(403);
  });

  it.each(["DEVELOPER", "ADMIN", "OWNER"] as Role[])("%s passa", async (role) => {
    expect(await runAs(role)).toBeUndefined();
  });
});
