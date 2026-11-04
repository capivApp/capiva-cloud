/** Erro que vai para o usuário como `erro: <mensagem>`, com o código de saída. */
export class CliError extends Error {
  constructor(
    message: string,
    readonly exitCode = 1,
  ) {
    super(message);
    this.name = "CliError";
  }
}
