/**
 * Conversão de "quantities" do Kubernetes para unidades numéricas estáveis.
 * CPU → millicores; memória → MiB. Usado pelo Monitoring (metrics.k8s.io).
 */

/** CPU: "10m" | "1" (cores) | "123456789n" (nanocores) | "5000000u" → millicores. */
export function cpuToMillicores(value?: string): number {
  if (!value) return 0;
  if (value.endsWith("n")) return Math.round(Number(value.slice(0, -1)) / 1_000_000);
  if (value.endsWith("u")) return Math.round(Number(value.slice(0, -1)) / 1_000);
  if (value.endsWith("m")) return Math.round(Number(value.slice(0, -1)));
  return Math.round(Number(value) * 1000);
}

const MEM_UNITS: Record<string, number> = {
  Ki: 1 / 1024,
  Mi: 1,
  Gi: 1024,
  Ti: 1024 * 1024,
  K: 1000 / (1024 * 1024),
  M: 1_000_000 / (1024 * 1024),
  G: 1_000_000_000 / (1024 * 1024),
};

/** Memória: "128Mi" | "1Gi" | "131072Ki" | "1000000" (bytes) → MiB. */
export function memoryToMib(value?: string): number {
  if (!value) return 0;
  const match = value.match(/^(\d+(?:\.\d+)?)([A-Za-z]+)?$/);
  if (!match) return 0;
  const amount = Number(match[1]);
  const unit = match[2];
  if (!unit) return Math.round(amount / (1024 * 1024)); // bytes
  return Math.round(amount * (MEM_UNITS[unit] ?? 0));
}
