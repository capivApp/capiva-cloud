/**
 * Manifests de quota do namespace do ambiente: ResourceQuota (limites) e
 * LimitRange (defaults por container). Funções puras, sem cluster.
 */
import { describe, expect, it } from "bun:test";
import { limitRangeManifest, resourceQuotaManifest } from "@infra/kubernetes/quotaManifests";

describe("resourceQuotaManifest", () => {
  it("traduz cada limite para requests e limits do namespace", () => {
    const manifest = resourceQuotaManifest("prod", { cpuMillicores: 4000, memoryMib: 8192, pods: 20, storageGi: 100 }) as Record<string, any>;
    expect(manifest.kind).toBe("ResourceQuota");
    expect(manifest.metadata).toMatchObject({ name: "capiva-quota", namespace: "prod" });
    expect(manifest.spec.hard).toEqual({
      "requests.cpu": "4000m",
      "limits.cpu": "4000m",
      "requests.memory": "8192Mi",
      "limits.memory": "8192Mi",
      pods: "20",
      "requests.storage": "100Gi",
    });
  });

  it("só inclui os limites definidos", () => {
    const manifest = resourceQuotaManifest("dev", { cpuMillicores: null, memoryMib: null, pods: 5, storageGi: null }) as Record<string, any>;
    expect(manifest.spec.hard).toEqual({ pods: "5" });
  });

  it("sem nenhum limite não gera quota", () => {
    expect(resourceQuotaManifest("dev", { cpuMillicores: null, memoryMib: null, pods: null, storageGi: null })).toBeNull();
  });
});

describe("limitRangeManifest", () => {
  it("dá requests e limits padrão a container sem recursos declarados", () => {
    const manifest = limitRangeManifest("prod") as Record<string, any>;
    expect(manifest.kind).toBe("LimitRange");
    expect(manifest.metadata).toMatchObject({ name: "capiva-limits", namespace: "prod" });
    expect(manifest.spec.limits).toEqual([
      { type: "Container", default: { cpu: "250m", memory: "512Mi" }, defaultRequest: { cpu: "100m", memory: "128Mi" } },
    ]);
  });
});
