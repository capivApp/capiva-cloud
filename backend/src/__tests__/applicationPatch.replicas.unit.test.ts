/**
 * ApplicationService.patch com `replicas` (tela ou capiva.json): checa a quota com as
 * réplicas novas, escala o Deployment que já existe e, com HPA ativo, não aplica
 * réplicas fixas e avisa. QuotaService real; repositories e cluster mockados.
 */
import { beforeAll, describe, expect, it, mock } from "bun:test";

await mock.module("@database/withTransaction", () => ({ withTransaction: (fn: () => unknown) => fn() }));

let ApplicationService: typeof import("@service/ApplicationService").ApplicationService;
let QuotaService: typeof import("@service/QuotaService").QuotaService;

beforeAll(async () => {
  ({ ApplicationService } = await import("@service/ApplicationService"));
  ({ QuotaService } = await import("@service/QuotaService"));
});

const tenant = { organizationId: "org_1" };
const SEM_QUOTA = { quotaCpuMillicores: null, quotaMemoryMib: null, quotaPods: null, quotaStorageGi: null };

interface Cenario {
  app?: Record<string, unknown>;
  hpa?: { minReplicas: number; maxReplicas: number } | null;
  quota?: Partial<Record<keyof typeof SEM_QUOTA, number>>;
}

function makeService({ app: appOverrides = {}, hpa = null, quota = {} }: Cenario = {}) {
  const app = {
    id: "app_1",
    name: "api",
    environmentId: "env_1",
    profile: "SMALL",
    customResources: null,
    sourceConfig: {},
    rolloutStrategy: "ROLLING",
    desiredStatus: "running",
    previewOfId: null,
    previews: [],
    ...appOverrides,
  };
  const updates: Record<string, unknown>[] = [];
  const apps = {
    findById: mock(async () => app),
    update: mock(async (_id: string, data: Record<string, unknown>) => {
      updates.push(data);
      return { ...app, ...data };
    }),
  };
  const scalingRepo = { findByApplication: mock(async () => (hpa ? { ...hpa, metric: "CPU", target: 70 } : null)) };
  const kube = { forEnvironment: mock(async () => ({ kubeconfig: "cfg", namespace: "prod" })) };
  const k8s = { scaleDeployment: mock(async () => undefined) };
  const finops = {
    findInventarioDoAmbiente: mock(async () => ({
      aplicacoes: [{ ...app, projectId: "p", scaling: hpa, volumes: [] }],
      bancos: [],
    })),
  };
  const environments = { findById: mock(async () => ({ id: "env_1", ...SEM_QUOTA, ...quota })) };
  const quotas = new QuotaService(finops as never, environments as never, {} as never, kube as never);
  const service = new ApplicationService(
    apps as never,
    {} as never,
    {} as never,
    {} as never,
    scalingRepo as never,
    {} as never,
    kube as never,
    k8s as never,
    {} as never,
    {} as never,
    quotas,
    {} as never,
    {} as never,
  );
  const reconcile = mock(async () => ({ ready: true }));
  service.reconcile = reconcile;
  return { service, k8s, updates, reconcile };
}

describe("ApplicationService.patch: réplicas", () => {
  it("escala o Deployment que já existe para as réplicas novas", async () => {
    const { service, k8s, updates } = makeService();
    const result = await service.patch("app_1", { replicas: 4 }, tenant);

    expect(updates[0]?.sourceConfig).toMatchObject({ replicas: 4 });
    expect(k8s.scaleDeployment).toHaveBeenCalledWith({ kubeconfig: "cfg", namespace: "prod" }, "api", 4);
    expect(result.aviso).toBeUndefined();
  });

  it("recusa com 422 as réplicas que estouram a quota, sem gravar nem escalar", async () => {
    const { service, k8s, updates } = makeService({ app: { rolloutStrategy: "CANARY" }, quota: { quotaPods: 10 } });

    const erro = await service.patch("app_1", { replicas: 50 }, tenant).catch((e: unknown) => e);
    expect(erro).toMatchObject({
      status: 422,
      errors: [expect.objectContaining({ path: "replicas" })],
    });
    expect(updates).toEqual([]);
    expect(k8s.scaleDeployment).not.toHaveBeenCalled();
  });

  it("desconta as réplicas atuais da própria aplicação na quota", async () => {
    const { service, k8s } = makeService({ app: { sourceConfig: { replicas: 3 } }, quota: { quotaPods: 4 } });
    await service.patch("app_1", { replicas: 4 }, tenant);
    expect(k8s.scaleDeployment).toHaveBeenCalledTimes(1);
  });

  it("canário e blue/green não escalam Deployment: o reconcile aplica as réplicas no Rollout", async () => {
    const { service, k8s, reconcile } = makeService({ app: { rolloutStrategy: "BLUE_GREEN" } });
    await service.patch("app_1", { replicas: 3 }, tenant);
    expect(k8s.scaleDeployment).not.toHaveBeenCalled();
    expect(reconcile).toHaveBeenCalledTimes(1);
  });

  it("com HPA ativo, não aplica réplicas fixas e avisa na resposta", async () => {
    const { service, k8s } = makeService({ hpa: { minReplicas: 1, maxReplicas: 3 } });
    const result = await service.patch("app_1", { replicas: 6 }, tenant);

    expect(k8s.scaleDeployment).not.toHaveBeenCalled();
    expect(result.aviso).toBe("O autoscaling está ativo e controla as réplicas. Para usar réplicas fixas, desative o autoscaling.");
  });

  it("aplicação parada continua parada", async () => {
    const { service, k8s } = makeService({ app: { desiredStatus: "stopped" } });
    await service.patch("app_1", { replicas: 4 }, tenant);
    expect(k8s.scaleDeployment).not.toHaveBeenCalled();
  });

  it("sem réplicas no pedido, não escala", async () => {
    const { service, k8s } = makeService();
    await service.patch("app_1", { healthPath: "/health" }, tenant);
    expect(k8s.scaleDeployment).not.toHaveBeenCalled();
  });
});
