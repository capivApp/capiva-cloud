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
