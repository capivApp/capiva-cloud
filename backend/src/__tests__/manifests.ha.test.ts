import { describe, expect, it } from "bun:test";
import {
  cronJobManifest,
  deploymentManifest,
  podDisruptionBudgetManifest,
  rolloutManifest,
  type AppManifestInput,
} from "@infra/kubernetes/manifests";

const baseInput: AppManifestInput = {
  name: "api",
  namespace: "prod",
  image: "registry.local/api:1.0.0",
  port: 8080,
  profile: "SMALL",
  volumes: [{ name: "data", mountPath: "/var/data" }],
  imagePullSecret: "registry-cred",
};

/** Atalhos de leitura do pod spec (o manifest é um objeto solto por design). */
const podSpec = (manifest: Record<string, any>) => manifest.spec.template.spec;
const container = (manifest: Record<string, any>) => podSpec(manifest).containers[0];

describe("deploymentManifest — alta disponibilidade", () => {
  const manifest = deploymentManifest(baseInput, 3) as Record<string, any>;

  it("faz rollout sem derrubar réplica antiga antes da nova ficar pronta", () => {
    expect(manifest.spec.strategy).toEqual({ type: "RollingUpdate", rollingUpdate: { maxUnavailable: 0, maxSurge: 1 } });
    expect(manifest.spec.minReadySeconds).toBe(10);
  });

  it("define liveness além de readiness (processo travado é reiniciado)", () => {
    expect(container(manifest).readinessProbe).toBeDefined();
    expect(container(manifest).livenessProbe).toBeDefined();
    // Liveness mata o container: precisa ser mais tolerante que a readiness.
    expect(container(manifest).livenessProbe.failureThreshold).toBeGreaterThan(
      container(manifest).readinessProbe.failureThreshold,
    );
  });

  it("espalha as réplicas entre nós e zonas sem travar cluster de nó único", () => {
    const keys = podSpec(manifest).topologySpreadConstraints.map((c: any) => c.topologyKey);
    expect(keys).toEqual(["kubernetes.io/hostname", "topology.kubernetes.io/zone"]);
    for (const c of podSpec(manifest).topologySpreadConstraints) {
      expect(c.whenUnsatisfiable).toBe("ScheduleAnyway");
    }
  });

  it("dá tempo para o processo encerrar o que está em voo", () => {
    expect(podSpec(manifest).terminationGracePeriodSeconds).toBe(30);
  });
});

describe("podDisruptionBudgetManifest", () => {
  it("limita a indisponibilidade a um pod por vez", () => {
    const pdb = podDisruptionBudgetManifest("api", "prod") as Record<string, any>;
    expect(pdb.apiVersion).toBe("policy/v1");
    expect(pdb.spec.maxUnavailable).toBe(1);
    expect(pdb.spec.selector.matchLabels["app.kubernetes.io/name"]).toBe("api");
  });
});

describe("rolloutManifest — paridade com o Deployment", () => {
  // Regressão: o Rollout montava um container mínimo, então trocar a estratégia
  // para Blue/Green ou Canary fazia a app perder volumes e pull secret.
  it("mantém volumes, pull secret e probes ao usar Blue/Green", () => {
    const manifest = rolloutManifest(baseInput, "BLUE_GREEN", 2) as Record<string, any>;
    expect(podSpec(manifest).imagePullSecrets).toEqual([{ name: "registry-cred" }]);
    expect(podSpec(manifest).volumes).toEqual([
      { name: "data", persistentVolumeClaim: { claimName: "api-data" } },
    ]);
    expect(container(manifest).volumeMounts).toEqual([{ name: "data", mountPath: "/var/data" }]);
    expect(container(manifest).readinessProbe).toBeDefined();
    expect(container(manifest).livenessProbe).toBeDefined();
  });

  it("gera os passos de canary até 100%", () => {
    const manifest = rolloutManifest(baseInput, "CANARY", 2, { initialTraffic: 20, increment: 40 }) as Record<string, any>;
    const weights = manifest.spec.strategy.canary.steps
      .filter((s: any) => s.setWeight !== undefined)
      .map((s: any) => s.setWeight);
    expect(weights).toEqual([20, 60, 100]);
  });

  // Regressão: `increment: 0` fazia o laço de montagem dos passos nunca terminar,
  // travando o processo do backend inteiro na criação da app.
  it("não trava com incremento zero ou negativo", () => {
    for (const increment of [0, -5, Number.NaN]) {
      const manifest = rolloutManifest(baseInput, "CANARY", 2, { increment }) as Record<string, any>;
      const steps = manifest.spec.strategy.canary.steps;
      expect(steps.length).toBeGreaterThan(0);
      expect(steps.at(-1)).toEqual({ setWeight: 100 });
    }
  });
});

describe("cronJobManifest", () => {
  it("impede execuções concorrentes e limita o histórico", () => {
    const manifest = cronJobManifest("nightly", "prod", "0 3 * * *", "img:1", "NANO") as Record<string, any>;
    expect(manifest.spec.concurrencyPolicy).toBe("Forbid");
    expect(manifest.spec.successfulJobsHistoryLimit).toBe(3);
    expect(manifest.spec.startingDeadlineSeconds).toBe(120);
  });
});
