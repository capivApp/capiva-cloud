/**
 * Erro de domínio com status HTTP. Lançado por Services e tratado pelo
 * middleware de erros. Mantém Controllers livres de tratamento manual.
 */
export class HttpError extends Error {
  constructor(
    public readonly message: string,
    public readonly status: number = 400,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "HttpError";
  }

  static badRequest(msg: string, code?: string) {
    return new HttpError(msg, 400, code);
  }
  static unauthorized(msg = "Não autenticado") {
    return new HttpError(msg, 401, "UNAUTHORIZED");
  }
  static forbidden(msg = "Sem permissão") {
    return new HttpError(msg, 403, "FORBIDDEN");
  }
  static notFound(msg = "Não encontrado") {
    return new HttpError(msg, 404, "NOT_FOUND");
  }
  static conflict(msg: string) {
    return new HttpError(msg, 409, "CONFLICT");
  }
}
