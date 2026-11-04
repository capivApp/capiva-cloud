/**
 * Mapeia perfis amigáveis (Nano..XLarge) → requests/limits do Kubernetes.
 * Escondido do usuário; usado pelos reconcilers ao montar os manifests.
 */
export const RESOURCE_PROFILES = {
  NANO: { cpu: "100m", memory: "128Mi" },
  SMALL: { cpu: "250m", memory: "512Mi" },
  MEDIUM: { cpu: "500m", memory: "1Gi" },
  LARGE: { cpu: "1", memory: "2Gi" },
  XLARGE: { cpu: "2", memory: "4Gi" },
} as const;

export type ProfileKey = keyof typeof RESOURCE_PROFILES;

export function resolveResources(profile: string, custom?: Record<string, unknown> | null) {
  if (profile === "CUSTOM" && custom) {
    return custom as { cpu: string; memory: string };
  }
  return RESOURCE_PROFILES[(profile as ProfileKey)] ?? RESOURCE_PROFILES.SMALL;
}

/**
 * Recursos de referência por instância de banco gerenciado (por tamanho). Os
 * operators não recebem requests/limits; a tabela é o que a plataforma CONTA
 * para quota e custo estimado. O disco vem de `storageFor` (databaseManifests).
 */
export const DATABASE_SIZE_RESOURCES = {
  EXTRA_SMALL: { cpu: "250m", memory: "256Mi" },
  SMALL: { cpu: "500m", memory: "1Gi" },
  MEDIUM: { cpu: "1", memory: "2Gi" },
  LARGE: { cpu: "2", memory: "4Gi" },
} as const;

export type DatabaseSizeKey = keyof typeof DATABASE_SIZE_RESOURCES;

export function resolveDatabaseResources(size: string): { cpu: string; memory: string } {
  return DATABASE_SIZE_RESOURCES[size as DatabaseSizeKey] ?? DATABASE_SIZE_RESOURCES.SMALL;
}
