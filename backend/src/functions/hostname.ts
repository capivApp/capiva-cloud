/** Hostname DNS (labels alfanuméricos com hífen, ao menos um ponto). */
export const HOST_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

export function isValidHostname(host: string): boolean {
  return HOST_RE.test(host);
}

/** Modo TLS do enum da app (UPPER) → valor armazenado no Domain (lower). */
export function tlsModeToStored(mode: "LETS_ENCRYPT" | "UPLOADED" | "NONE"): "lets_encrypt" | "uploaded" | "none" {
  return mode.toLowerCase() as "lets_encrypt" | "uploaded" | "none";
}
