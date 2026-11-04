import { validateRepoPath } from "@/lib/repoPath";

/**
 * Opções de build das origens sem Dockerfile (Nixpacks, Railpack, Buildpacks, Static,
 * Compose). Cada origem usa um subconjunto; o mapa abaixo é a fonte única de quais.
 * As chaves são as mesmas do `sourceConfig` lido pelas strategies do backend.
 */
export type BuildOptions = {
  subPath: string;
  installCommand: string;
  buildCommand: string;
  startCommand: string;
  outputDir: string;
  spa: boolean;
  builder: string;
  composeService: string;
};

export type BuildTextField = Exclude<keyof BuildOptions, "spa">;

export const EMPTY_BUILD_OPTIONS: BuildOptions = {
  subPath: "",
  installCommand: "",
  buildCommand: "",
  startCommand: "",
  outputDir: "",
  spa: false,
  builder: "",
  composeService: "",
};

export const BUILD_FIELDS_BY_SOURCE: Record<string, BuildTextField[]> = {
  NIXPACKS: ["subPath", "installCommand", "buildCommand", "startCommand"],
  RAILPACK: ["subPath"],
  BUILDPACKS: ["subPath", "builder"],
  STATIC: ["subPath", "buildCommand", "outputDir"],
  DOCKER_COMPOSE: ["composeService"],
};

/** Origens com a opção de SPA (rotas desconhecidas devolvem o index.html). */
const SPA_SOURCES = new Set(["STATIC"]);

const PATH_FIELDS = new Set<BuildTextField>(["subPath", "outputDir"]);

export const fieldsOf = (source: string): BuildTextField[] => BUILD_FIELDS_BY_SOURCE[source] ?? [];
export const isSpaSource = (source: string) => SPA_SOURCES.has(source);

/** Trecho do `sourceConfig` com as opções preenchidas da origem. */
export function buildOptionsConfig(source: string, options: BuildOptions): Record<string, unknown> {
  const entries = fieldsOf(source)
    .map((field) => [field, options[field].trim()] as const)
    .filter(([, value]) => value);
  const spa = isSpaSource(source) && options.spa ? { spa: true } : {};
  return { ...Object.fromEntries(entries), ...spa };
}

/** Erro por campo de caminho, para mostrar no próprio campo. */
export function validateBuildOptions(
  source: string,
  options: BuildOptions,
): Partial<Record<BuildTextField, string>> {
  const errors = fieldsOf(source)
    .filter((field) => PATH_FIELDS.has(field))
    .map((field) => [field, validateRepoPath(options[field])] as const)
    .filter(([, error]) => error);
  return Object.fromEntries(errors);
}
