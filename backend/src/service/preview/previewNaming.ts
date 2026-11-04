/**
 * Nome, host e URL do preview. O nome vira Deployment/Service/Ingress no
 * namespace do ambiente E o primeiro rótulo DNS do host, então respeita o
 * limite de 63 caracteres dos dois.
 */
const DNS_LABEL_MAX = 63;

export const buildPreviewName = (prNumber: number, appName: string): string =>
  `pr-${prNumber}-${appName}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .slice(0, DNS_LABEL_MAX)
    .replace(/-+$/, "");

const normalizeDominio = (domain: string | undefined): string =>
  (domain ?? "").trim().toLowerCase().replace(/^\.+/, "").replace(/\.+$/, "");

/** `pr-42-api.<CAPIVA_PREVIEW_DOMAIN>`; null quando não há domínio de preview. */
export const buildPreviewHost = (
  previewName: string,
  domain: string | undefined,
): string | null => {
  const base = normalizeDominio(domain);
  if (!base) return null;
  return `${previewName}.${base}`;
};

export const buildPreviewUrl = (host: string | null): string | null =>
  host ? `https://${host}` : null;
