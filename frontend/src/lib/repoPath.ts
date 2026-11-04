/**
 * Validação de caminhos dentro do repositório (Dockerfile, contexto de build,
 * arquivo de compose).
 *
 * Espelha o `repoPathSchema` do backend — o servidor continua sendo a autoridade;
 * aqui o objetivo é mostrar o erro no campo, antes de submeter o formulário.
 */
export function validateRepoPath(value: string): string | null {
  const path = value.trim();
  if (!path) return null; // vazio = campo não informado; quem exige valida à parte
  if (path.startsWith("/"))
    return "Use um caminho relativo à raiz do repositório (sem barra inicial).";
  if (path.split("/").includes("..")) return "Caminho não pode subir de diretório ('..').";
  if (path.length > 255) return "Caminho muito longo.";
  return null;
}

/** Variante para campos obrigatórios (ex.: Dockerfile na criação). */
export function validateRequiredRepoPath(value: string): string | null {
  if (!value.trim()) return "Informe o caminho.";
  return validateRepoPath(value);
}
