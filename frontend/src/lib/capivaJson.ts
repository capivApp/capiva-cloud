/**
 * Marca gravada pelo backend no deploy (`sourceConfig.capivaJson`): quais campos o
 * capiva.json do repositório declarou. Na tela esses campos ficam somente leitura,
 * porque o próximo deploy sobrescreveria qualquer edição feita aqui.
 */
export interface CapivaMarker {
  path: string;
  ref: string;
  fields: string[];
  envKeys: string[];
}

const isMarker = (value: unknown): value is CapivaMarker => {
  const m = value as Partial<CapivaMarker> | null;
  return typeof m?.path === "string" && Array.isArray(m.fields) && Array.isArray(m.envKeys);
};

export function readCapivaMarker(
  sourceConfig: Record<string, unknown> | null | undefined,
): CapivaMarker | null {
  const value = sourceConfig?.capivaJson;
  return isMarker(value) ? value : null;
}

export function isCapivaManaged(marker: CapivaMarker | null, field: string): boolean {
  return Boolean(marker?.fields.includes(field));
}

const ACTION = "Para mudar, edite o arquivo no repositório.";

/** Texto do aviso para uma seção da tela, ou null quando o arquivo não a declara. */
export function buildCapivaNotice(marker: CapivaMarker | null, fields: string[]): string | null {
  if (!marker || !fields.some((f) => isCapivaManaged(marker, f))) return null;
  if (fields.includes("env") && marker.envKeys.length)
    return `${marker.envKeys.join(", ")} são definidas pelo ${marker.path}. ${ACTION}`;
  return `Campos marcados são definidos pelo ${marker.path}. ${ACTION}`;
}
