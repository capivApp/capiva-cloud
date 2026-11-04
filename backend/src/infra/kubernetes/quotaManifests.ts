import { RESOURCE_PROFILES } from "@infra/kubernetes/profiles";
import { isQuotaDefinida, type QuotaLimite } from "@functions/finops/quota";
import type { RecursoDeConsumo } from "@functions/finops/consumo";
import type { K8sManifest } from "@interface/integrations";

export const RESOURCE_QUOTA_NAME = "capiva-quota";
export const LIMIT_RANGE_NAME = "capiva-limits";

/** Cada limite da plataforma vira uma ou mais chaves `hard` do ResourceQuota. */
const HARD_POR_RECURSO: Record<RecursoDeConsumo, (valor: number) => Record<string, string>> = {
  cpuMillicores: (m) => ({ "requests.cpu": `${m}m`, "limits.cpu": `${m}m` }),
  memoryMib: (mib) => ({ "requests.memory": `${mib}Mi`, "limits.memory": `${mib}Mi` }),
  pods: (n) => ({ pods: String(n) }),
  storageGi: (gi) => ({ "requests.storage": `${gi}Gi` }),
};

const buildHard = (limite: QuotaLimite): Record<string, string> =>
  Object.assign(
    {},
    ...(Object.keys(HARD_POR_RECURSO) as RecursoDeConsumo[]).flatMap((recurso) => {
      const valor = limite[recurso];
      return valor === null ? [] : [HARD_POR_RECURSO[recurso](valor)];
    }),
  );

/** ResourceQuota do namespace do ambiente. `null` quando não há limite algum. */
export function resourceQuotaManifest(namespace: string, limite: QuotaLimite): K8sManifest | null {
  if (!isQuotaDefinida(limite)) return null;
  return {
    apiVersion: "v1",
    kind: "ResourceQuota",
    metadata: { name: RESOURCE_QUOTA_NAME, namespace },
    spec: { hard: buildHard(limite) },
  };
}

/**
 * LimitRange do namespace. Com quota de CPU/memória o Kubernetes RECUSA pod sem
 * requests/limits (bancos via operator, jobs de build). O default dá a esses pods
 * o perfil SMALL de limite e o NANO de request, e eles entram.
 */
export function limitRangeManifest(namespace: string): K8sManifest {
  return {
    apiVersion: "v1",
    kind: "LimitRange",
    metadata: { name: LIMIT_RANGE_NAME, namespace },
    spec: {
      limits: [
        {
          type: "Container",
          default: { cpu: RESOURCE_PROFILES.SMALL.cpu, memory: RESOURCE_PROFILES.SMALL.memory },
          defaultRequest: { cpu: RESOURCE_PROFILES.NANO.cpu, memory: RESOURCE_PROFILES.NANO.memory },
        },
      ],
    },
  };
}
