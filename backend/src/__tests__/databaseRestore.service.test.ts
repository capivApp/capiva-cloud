/**
 * DatabaseRestoreService: guards do backup, os dois modos (sobre o próprio banco
 * e como cópia), o Secret efêmero + Job aplicados e a atualização do andamento
 * pelo Job. Repositories e cluster mockados, transação simulada. Sem banco.
 */
import { beforeAll, describe, expect, it, mock } from "bun:test";

mock.module("@database/withTransaction", () => ({ withTransaction: (fn: () => unknown) => fn() }));

type Service = import("@service/DatabaseRestoreService").DatabaseRestoreService;
let DatabaseRestoreService: typeof import("@service/DatabaseRestoreService").DatabaseRestoreService;

beforeAll(async () => {
  ({ DatabaseRestoreService } = await import("@service/DatabaseRestoreService"));
});

const tenant = { organizationId: "org_1" };
const sourceDb = {
  id: "db_1",
  name: "orders-db",
  kind: "POSTGRESQL",
  size: "SMALL",
  highAvailability: false,
  projectId: "prj_1",
  environmentId: "env_1",
  config: { username: "capiva", database: "orders" },
};
const completedBackup = {
  id: "bkp_000001",
  databaseId: "db_1",
  status: "completed",
  destination: "orders-db/single/orders-20261104-100000.sql.gz",
  storageProviderId: null,
};

function makeService(overrides: { backup?: Record<string, unknown>; db?: Record<string, unknown>; existingByName?: unknown } = {}) {
  const records = new Map<string, Record<string, any>>();
  const applied: Record<string, any>[] = [];
  const removed: string[] = [];
  const db = { ...sourceDb, ...overrides.db };

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
    findById: mock(async (id: string) => records.get(id) ?? null),
    listByDatabase: mock(async () => [...records.values()]),
  };
  const copy = { ...sourceDb, id: "db_2", name: "orders-copia" };
  const databases = {
    findById: mock(async (id: string) => ({ db_1: db, db_2: copy })[id] ?? null),
    findByNameInEnvironment: mock(async () => overrides.existingByName ?? null),
  };
  const backups = { findById: mock(async () => ({ ...completedBackup, ...overrides.backup })) };
  const environments = { findById: mock(async () => ({ id: "env_1", namespace: "prod" })) };
  const managedDatabases = { create: mock(async () => copy) };
  const storage = {
    resolveCredentials: mock(async () => ({ endpoint: "http://minio:9000", bucket: "bkp", accessKeyId: "ak", secretAccessKey: "sk" })),
  };
  const kube = { forEnvironment: mock(async () => ({ kubeconfig: "cfg", namespace: "prod" })) };
  const observed = { current: { ready: false, raw: { active: 1 } } as Record<string, unknown> };
  const k8s = {
    apply: mock(async (_ctx: unknown, manifest: Record<string, any>) => void applied.push(manifest)),
    observe: mock(async () => observed.current),
    remove: mock(async (_ctx: unknown, _api: string, kind: string, name: string) => void removed.push(`${kind}/${name}`)),
  };

  const service = new DatabaseRestoreService(
    restores as never,
    backups as never,
    databases as never,
    environments as never,
    managedDatabases as never,
    storage as never,
    kube as never,
    k8s as never,
  );
  return { service, records, applied, removed, managedDatabases, observed, k8s };
}

const secretValue = (manifest: Record<string, any>, key: string) => Buffer.from(manifest.data[key], "base64").toString();

describe("DatabaseRestoreService.requestRestore", () => {
  it("sobre o próprio banco: aplica Secret efêmero + Job e registra RUNNING", async () => {
    const { service, applied } = makeService();
    const restore = await service.requestRestore("db_1", "bkp_000001", { mode: "IN_PLACE", confirmName: "orders-db" }, tenant, "usr_1");

    expect(restore).toMatchObject({ status: "RUNNING", mode: "IN_PLACE", sourceDatabaseId: "db_1", targetDatabaseId: "db_1", requestedBy: "usr_1" });
    const [secret, job] = applied;
    expect(secret.kind).toBe("Secret");
    expect(secretValue(secret, "OBJECT_KEY")).toBe(completedBackup.destination);
    expect(secretValue(secret, "SRC_URL")).toContain("orders-db-rw.prod.svc.cluster.local");
    expect(job.kind).toBe("Job");
    expect(job.spec.template.spec.containers[0].command[2]).toContain("DROP SCHEMA");
    expect(restore.jobName).toBe(job.metadata.name);
    expect(restore.secretName).toBe(secret.metadata.name);
  });

  it("como cópia: cria o banco novo pelo fluxo existente e restaura nele", async () => {
    const { service, applied, managedDatabases } = makeService();
    const restore = await service.requestRestore("db_1", "bkp_000001", { mode: "AS_COPY", newName: "orders-copia" }, tenant);

    expect(managedDatabases.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "orders-copia", kind: "POSTGRESQL", projectId: "prj_1", environmentId: "env_1", username: "capiva", database: "orders" }),
      tenant,
    );
    expect(restore).toMatchObject({ mode: "AS_COPY", targetDatabaseId: "db_2", targetName: "orders-copia" });
    expect(secretValue(applied[0], "SRC_URL")).toContain("orders-copia-rw.prod.svc.cluster.local");
    expect(applied[1].spec.template.spec.containers[0].command[2]).not.toContain("DROP SCHEMA");
  });

  it("recusa nome de cópia já usado no ambiente", async () => {
    const { service } = makeService({ existingByName: { id: "db_9" } });
    await expect(service.requestRestore("db_1", "bkp_000001", { mode: "AS_COPY", newName: "orders-copia" }, tenant)).rejects.toMatchObject({ status: 409 });
  });

  it("recusa confirmação errada, backup não concluído e backup sem objeto único", async () => {
    await expect(makeService().service.requestRestore("db_1", "bkp_000001", { mode: "IN_PLACE", confirmName: "x" }, tenant)).rejects.toMatchObject({ status: 400 });
    await expect(
      makeService({ backup: { status: "running" } }).service.requestRestore("db_1", "bkp_000001", { mode: "IN_PLACE", confirmName: "orders-db" }, tenant),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      makeService({ backup: { destination: "orders-db/all" } }).service.requestRestore("db_1", "bkp_000001", { mode: "IN_PLACE", confirmName: "orders-db" }, tenant),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("tipo sem suporte responde erro claro", async () => {
    const { service } = makeService({ db: { kind: "REDIS" } });
    await expect(service.requestRestore("db_1", "bkp_000001", { mode: "IN_PLACE", confirmName: "orders-db" }, tenant)).rejects.toMatchObject({
      status: 400,
    });
  });

  it("falha ao aplicar no cluster registra FAILED", async () => {
    const { service, k8s } = makeService();
    k8s.apply.mockImplementation(async () => {
      throw new Error("forbidden");
    });
    const restore = await service.requestRestore("db_1", "bkp_000001", { mode: "IN_PLACE", confirmName: "orders-db" }, tenant);
    expect(restore.status).toBe("FAILED");
    expect(restore.finishedAt).toBeInstanceOf(Date);
  });
});

describe("DatabaseRestoreService.getById", () => {
  it("atualiza pelo Job e apaga o Secret efêmero quando termina", async () => {
    const { service, observed, removed } = makeService();
    const started = await service.requestRestore("db_1", "bkp_000001", { mode: "IN_PLACE", confirmName: "orders-db" }, tenant);

    expect((await service.getById("db_1", started.id, tenant)).status).toBe("RUNNING");
    expect(removed).toEqual([]);

    observed.current = { ready: false, raw: { succeeded: 1 } };
    const done = await service.getById("db_1", started.id, tenant);
    expect(done.status).toBe("COMPLETED");
    expect(done.finishedAt).toBeInstanceOf(Date);
    expect(removed).toEqual([`Secret/${started.secretName}`]);
  });

  it("restore de outro banco não é servido", async () => {
    const { service } = makeService();
    const started = await service.requestRestore("db_1", "bkp_000001", { mode: "IN_PLACE", confirmName: "orders-db" }, tenant);
    await expect(service.getById("db_2", started.id, tenant)).rejects.toMatchObject({ status: 404 });
  });
});
