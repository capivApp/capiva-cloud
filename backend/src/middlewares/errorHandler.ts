import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { HttpError } from "@functions/HttpError";

/** Tratamento central de erros — Controllers nunca tratam erro manualmente. */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(422).json({ error: "VALIDATION", issues: err.issues });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.code ?? "ERROR", message: err.message });
    return;
  }
  console.error("[error]", err);
  res.status(500).json({ error: "INTERNAL", message: "Erro interno." });
}
