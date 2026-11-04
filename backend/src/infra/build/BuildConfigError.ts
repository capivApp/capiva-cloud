/** Configuração de build impossível de executar (repositório ausente, registry exigido). */
export class BuildConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
