/**
 * Lê uma entrada de strategy map por uma chave que veio de fora (header, payload,
 * JSON gravado). Só considera chaves PRÓPRIAS do mapa: `map["constructor"]`
 * devolveria a função do protótipo e seria chamada como se fosse uma strategy.
 */
export function strategyFor<T>(map: Record<string, T>, key: unknown): T | undefined {
  return typeof key === "string" && Object.hasOwn(map, key) ? map[key] : undefined;
}
