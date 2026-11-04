/**
 * VolumeRestoreService: restore de backup Longhorn num volume NOVO (Volume CR +
 * PV + PVC) e o andamento lido do Volume. Repositories e cluster mockados.
 */
import { beforeAll, describe, expect, it, mock } from "bun:test";

mock.module("@database/withTransaction", () => ({ withTransaction: (fn: () => unknown) => fn() }));

type Service = import("@service/VolumeRestoreService").VolumeRestoreService;
let VolumeRestoreService: typeof import("@service/VolumeRestoreService").VolumeRestoreService;

beforeAll(async () => {
  ({ VolumeRestoreService } = await import("@service/VolumeRestoreService"));
});

const tenant = { organizationId: "org_1" };

function makeService(overrides: { backup?: Record<string, unknown>; backupStatus?: Record<string, unknown> } = {}) {
  const records = new Map<string, Record<string, any>>();
  const applied: Record<string, any>[] = [];
  const observedCalls: string[] = [];
  const restores = {
    create: mock(async (data: Record<string, unknown>) => {
      const row = { id: "rst_00abcdef", status: "PENDING", ...data };
      records.set(row.id, row);
      return row;
    }),
    update: mock(async (id: string, data: Record<string, unknown>) => {
      const row = { ...records.get(id), ...data };
      records.set(id, row);
      return row;
    }),
    listByVolume: mock(async () => [...records.values()]),
  };
  const backups = {
    findById: mock(async () => ({ id: "bkp_000001", volumeId: "vol_1", status: "completed", ...overrides.backup })),
  };
  const volumes = { findById: mock(async () => ({ id: "vol_1", applicationId: "app_1", name: "data", sizeGi: 5, accessMode: "RWO" })) };
  const apps = { findById: mock(async () => ({ id: "app_1", name: "api", environmentId: "env_1" })) };
  const kube = { forEnvironment: mock(async () => ({ kubeconfig: "cfg", namespace: "prod" })) };
  const volumeState = { current: { ready: false, raw: { restoreRequired: true, state: "attached" } } as Record<string, unknown> };
  const k8s = {
    apply: mock(async (_ctx: unknown, manifest: Record<string, any>) => void applied.push(manifest)),
    observe: mock(async (ctx: { namespace: string }, _api: string, kind: string, name: string) => {
      observedCalls.push(`${ctx.namespace}/${kind}/${name}`);
      if (kind === "Backup") return overrides.backupStatus ?? { ready: false, raw: { url: "s3://bkp@us-east-1/?backup=b1&volume=pvc-1" } };
      return volumeState.current;
    }),
  };
  const service = new VolumeRestoreService(restores as never, backups as never, volumes as never, apps as never, kube as never, k8s as never) as Service;
  return { service, applied, observedCalls, volumeState };
}

describe("VolumeRestoreService", () => {
  it("cria Volume Longhorn, PV e PVC novos a partir da URL do backup", async () => {
    const { service, applied, observedCalls } = makeService();
    const restore = await service.requestRestore("app_1", "vol_1", "bkp_000001", tenant, "usr_1");

    expect(observedCalls[0]).toBe("longhorn-system/Backup/api-data-000001");
    expect(applied.map((m) => m.kind)).toEqual(["Volume", "PersistentVolume", "PersistentVolumeClaim"]);
    expect(applied[0].spec.fromBackup).toBe("s3://bkp@us-east-1/?backup=b1&volume=pvc-1");
    expect(restore).toMatchObject({ status: "RUNNING", kind: "VOLUME", mode: "AS_COPY", volumeId: "vol_1", targetName: "api-data-restore-abcdef" });
  });

  it("sem URL no backup do Longhorn, registra FAILED sem aplicar nada", async () => {
    const { service, applied } = makeService({ backupStatus: { ready: false, raw: {} } });
    const restore = await service.requestRestore("app_1", "vol_1", "bkp_000001", tenant);
    expect(restore.status).toBe("FAILED");
    expect(applied).toEqual([]);
  });

  it("recusa backup de outro volume e backup não concluído", async () => {
    await expect(makeService({ backup: { volumeId: "vol_9" } }).service.requestRestore("app_1", "vol_1", "bkp_000001", tenant)).rejects.toMatchObject({ status: 404 });
    await expect(makeService({ backup: { status: "failed" } }).service.requestRestore("app_1", "vol_1", "bkp_000001", tenant)).rejects.toMatchObject({ status: 400 });
  });

  it("lista com o andamento lido do Volume restaurado", async () => {
    const { service, volumeState } = makeService();
    await service.requestRestore("app_1", "vol_1", "bkp_000001", tenant);
    expect((await service.list("app_1", "vol_1", tenant))[0].status).toBe("RUNNING");

    volumeState.current = { ready: false, raw: { restoreRequired: false, state: "detached" } };
    const [done] = await service.list("app_1", "vol_1", tenant);
    expect(done.status).toBe("COMPLETED");
    expect(done.finishedAt).toBeInstanceOf(Date);
  });
});
