/**
 * PreviewDatabaseCloner: cada banco que a origem usa ganha um clone ligado ao preview.
 * Com backup restaurável, o clone recebe os dados do último backup (restore como cópia)
 * e o deploy espera a cópia terminar; sem backup ou em tipo sem dump lógico, o clone
 * sobe vazio e o PR recebe o aviso. Repositories e services mockados: sem banco e sem
 * cluster.
 */
import { beforeAll, describe, expect, mock, test } from "bun:test";
import type { Application, Backup, ManagedDatabase } from "@prisma-generated/client";
import { encrypt } from "@functions/crypto";

await mock.module("@database/withTransaction", () => ({
  withTransaction: (fn: () => unknown) => fn(),
}));

let PreviewDatabaseCloner: typeof import("@service/preview/PreviewDatabaseCloner").PreviewDatabaseCloner;

beforeAll(async () => {
  ({ PreviewDatabaseCloner } = await import("@service/preview/PreviewDatabaseCloner"));
});

const tenant = { organizationId: "org-1" };
const fast = { pollMs: 0, timeoutMs: 50 };

const origem = { id: "app-1", projectId: "proj-1", name: "api" } as unknown as Application;
const preview = {
  id: "prev-1",
  projectId: "proj-1",
  name: "pr-42-api",
  previewPrNumber: 42,
} as unknown as Application;

const banco = (over: Partial<ManagedDatabase>): ManagedDatabase =>
  ({
    id: "db-1",
    projectId: "proj-1",
    environmentId: "env-1",
    name: "pg",
    kind: "POSTGRESQL",
    previewOfApplicationId: null,
    ...over,
  }) as ManagedDatabase;

const pg = banco({});
const naoUsado = banco({ id: "db-9", name: "outro" });
const cloneAntigo = banco({ id: "db-7", name: "pr-41-pg", previewOfApplicationId: "prev-0" });
const backupBom = {
  id: "bk-1",
  status: "completed",
  destination: "s3://b/pg.sql.gz",
  startedAt: new Date(),
} as Backup;

const injected = (value: string) => ({
  key: "DATABASE_URL",
  value: encrypt(value),
  source: "INJECTED",
  secret: true,
});

function makeCloner(
  opts: { bancos?: ManagedDatabase[]; backups?: Backup[]; restoreStatus?: string[] } = {},
) {
  const statuses = [...(opts.restoreStatus ?? ["RUNNING", "COMPLETED"])];
  const databases = {
    listByProject: mock(async () => opts.bancos ?? [pg, naoUsado, cloneAntigo]),
    markAsPreviewOf: mock(async () => undefined),
    listByPreviewApplication: mock(async () => [
      banco({ id: "clone-1", previewOfApplicationId: "prev-1" }),
    ]),
    listPreviewClonesWithOrg: mock(async () => [
      {
        ...banco({ id: "clone-orfao", previewOfApplicationId: "prev-apagado" }),
        project: { organizationId: "org-1" },
      },
      {
        ...banco({ id: "clone-vivo", previewOfApplicationId: "prev-1" }),
        project: { organizationId: "org-1" },
      },
    ]),
  };
  const environments = { findById: mock(async () => ({ id: "env-1", namespace: "prod" })) };
  const envVars = {
    listByApplication: mock(async () => [
      injected("postgresql://capiva:s3nha@pg-rw.prod.svc.cluster.local:5432/app"),
      { key: "LOG_LEVEL", value: "info", source: "MANUAL", secret: false },
    ]),
  };
  const backups = { listByDatabase: mock(async () => opts.backups ?? [backupBom]) };
  const managedDatabases = {
    attachToApplication: mock(async () => undefined),
    remove: mock(async () => undefined),
  };
  const restores = {
    requestRestore: mock(async () => ({
      id: "rs-1",
      targetDatabaseId: "clone-1",
      status: "PENDING",
    })),
    getById: mock(async () => ({ id: "rs-1", status: statuses.shift() ?? "COMPLETED" })),
    createCopyOf: mock(async () => banco({ id: "clone-vazio", name: "pr-42-pg" })),
  };
  const apps = { findById: mock(async (id: string) => (id === "prev-1" ? preview : null)) };
  const cloner = new PreviewDatabaseCloner(
    databases as never,
    environments as never,
    envVars as never,
    backups as never,
    managedDatabases as never,
    restores as never,
    apps as never,
  );
  return { cloner, databases, backups, managedDatabases, restores };
}

describe("cloneForPreview", () => {
  test("com backup: restaura como cópia, marca o clone, liga ao preview e espera a cópia", async () => {
    const { cloner, restores, databases, managedDatabases } = makeCloner();
    const notes = await cloner.cloneForPreview(origem, preview, tenant, fast);

    expect(restores.requestRestore).toHaveBeenCalledWith(
      "db-1",
      "bk-1",
      { mode: "AS_COPY", newName: "pr-42-pg" },
      tenant,
    );
    expect(databases.markAsPreviewOf).toHaveBeenCalledWith("clone-1", "prev-1");
    expect(managedDatabases.attachToApplication).toHaveBeenCalledWith("clone-1", "prev-1", tenant);
    expect(restores.getById).toHaveBeenCalledTimes(2);
    expect(notes).toEqual([]);
  });

  test("só clona os bancos que a origem usa, nunca um clone de outro preview", async () => {
    const { cloner, restores, backups } = makeCloner();
    await cloner.cloneForPreview(origem, preview, tenant, fast);
    expect(backups.listByDatabase).toHaveBeenCalledTimes(1);
    expect(restores.requestRestore).toHaveBeenCalledTimes(1);
  });

  test("sem backup concluído: clone vazio e aviso no PR", async () => {
    const { cloner, restores, databases, managedDatabases } = makeCloner({ backups: [] });
    const notes = await cloner.cloneForPreview(origem, preview, tenant, fast);

    expect(restores.requestRestore).not.toHaveBeenCalled();
    expect(restores.createCopyOf).toHaveBeenCalledWith(pg, "pr-42-pg", tenant);
    expect(databases.markAsPreviewOf).toHaveBeenCalledWith("clone-vazio", "prev-1");
    expect(managedDatabases.attachToApplication).toHaveBeenCalledWith(
      "clone-vazio",
      "prev-1",
      tenant,
    );
    expect(notes).toEqual(["O banco pg subiu vazio no preview: não há backup concluído."]);
  });

  test("restore que falha: aviso no PR", async () => {
    const { cloner } = makeCloner({ restoreStatus: ["FAILED"] });
    const notes = await cloner.cloneForPreview(origem, preview, tenant, fast);
    expect(notes).toEqual(["O banco pg subiu vazio no preview: a cópia dos dados falhou."]);
  });

  test("restore que não termina a tempo: aviso no PR", async () => {
    const { cloner } = makeCloner({ restoreStatus: Array.from({ length: 1000 }, () => "RUNNING") });
    const notes = await cloner.cloneForPreview(origem, preview, tenant, {
      pollMs: 1,
      timeoutMs: 5,
    });
    expect(notes).toEqual([
      "A cópia dos dados do banco pg ainda não terminou. O preview pode subir antes dela.",
    ]);
  });
});

describe("cloneForPreview com tipo sem restore", () => {
  test("Redis usado pela origem: clone vazio e aviso", async () => {
    const redis = banco({ id: "db-2", name: "cache", kind: "REDIS" });
    const { cloner, restores } = makeCloner({ bancos: [redis] });
    const envVarsComRedis = (
      cloner as unknown as { envVars: { listByApplication: () => Promise<unknown[]> } }
    ).envVars;
    envVarsComRedis.listByApplication = async () => [
      injected("redis://:s3nha@rfr-cache.prod.svc.cluster.local:6379"),
    ];

    const notes = await cloner.cloneForPreview(origem, preview, tenant, fast);
    expect(restores.requestRestore).not.toHaveBeenCalled();
    expect(restores.createCopyOf).toHaveBeenCalledWith(redis, "pr-42-cache", tenant);
    expect(notes).toEqual([
      "O banco cache subiu vazio no preview: o tipo REDIS não tem cópia de dados.",
    ]);
  });
});

describe("remoção", () => {
  test("removeForPreview destrói os clones do preview", async () => {
    const { cloner, databases, managedDatabases } = makeCloner();
    await cloner.removeForPreview("prev-1", tenant);
    expect(databases.listByPreviewApplication).toHaveBeenCalledWith("prev-1");
    expect(managedDatabases.remove).toHaveBeenCalledWith("clone-1", tenant);
  });

  test("removeOrphans destrói só o clone cujo preview não existe mais", async () => {
    const { cloner, managedDatabases } = makeCloner();
    expect(await cloner.removeOrphans()).toBe(1);
    expect(managedDatabases.remove).toHaveBeenCalledTimes(1);
    expect(managedDatabases.remove).toHaveBeenCalledWith("clone-orfao", tenant);
  });
});
