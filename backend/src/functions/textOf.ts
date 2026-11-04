/**
 * Lê como texto um campo de JSON externo (`unknown`: status do Kubernetes, config de
 * canal). `String(valor)` num objeto daria "[object Object]" em silêncio.
 */
export const textOf = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;
