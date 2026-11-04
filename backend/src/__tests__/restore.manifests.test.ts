/**
 * Restore de backup: manifests do Job de restore de banco, comandos por tipo de
 * banco e manifests do volume Longhorn restaurado. Funções puras, sem cluster.
 */
import { describe, expect, it } from "bun:test";
import {
  databaseRestoreJobManifest,
  interpretLonghornRestore,
  interpretRestoreJob,
  longhornRestoreVolumeManifest,
  restoredPersistentVolumeManifest,
  restoredPvcManifest,
  RESTORE_LABEL,
} from "@infra/kubernetes/restoreManifests";
import { createRestoreKindStrategy } from "@service/restore/restoreKind.strategy";

const podSpec = (manifest: Record<string, any>) => manifest.spec.template.spec;
const container = (manifest: Record<string, any>) => podSpec(manifest).containers[0];

describe("databaseRestoreJobManifest", () => {
  const manifest = databaseRestoreJobManifest({
    name: "orders-restore-abc123",
    namespace: "prod",
    command: "echo restore",
    secretName: "orders-restore-abc123",
    restoreId: "rst_1",
  }) as Record<string, any>;

  it("é um Job que roda o comando uma única vez", () => {
    expect(manifest.apiVersion).toBe("batch/v1");
    expect(manifest.kind).toBe("Job");
    expect(manifest.metadata).toMatchObject({ name: "orders-restore-abc123", namespace: "prod" });
    // Restore não é idempotente no modo cópia: reexecutar duplicaria linhas.
    expect(manifest.spec.backoffLimit).toBe(0);
    expect(podSpec(manifest).restartPolicy).toBe("Never");
    expect(container(manifest).command).toEqual(["sh", "-c", "echo restore"]);
  });

  it("lê as credenciais do Secret efêmero, nunca do manifest", () => {
    expect(container(manifest).envFrom).toEqual([{ secretRef: { name: "orders-restore-abc123" } }]);
    expect(JSON.stringify(manifest)).not.toContain("AWS_SECRET_ACCESS_KEY");
  });

  it("marca o Job com o id do restore e limita a duração", () => {
    expect(manifest.metadata.labels[RESTORE_LABEL]).toBe("rst_1");
    expect(manifest.spec.template.metadata.labels[RESTORE_LABEL]).toBe("rst_1");
    expect(manifest.spec.activeDeadlineSeconds).toBeGreaterThan(0);
    // O status é lido do Job: ele precisa sobreviver até o próximo polling.
    expect(manifest.spec.ttlSecondsAfterFinished).toBeGreaterThanOrEqual(3600);
  });
});

describe("comandos de restore por tipo de banco", () => {
  it("PostgreSQL sobre o próprio banco zera o schema antes de reaplicar o dump", () => {
    const command = createRestoreKindStrategy("POSTGRESQL").command({ resetTarget: true });
    expect(command).toContain(
      'mc cat "s3/$S3_BUCKET/$OBJECT_KEY" | gunzip | psql -v ON_ERROR_STOP=1 "$SRC_URL"',
    );
    expect(command).toContain("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
    expect(command.indexOf("DROP SCHEMA")).toBeLessThan(command.indexOf("mc cat"));
  });

  it("PostgreSQL como cópia não apaga nada (o banco é novo)", () => {
    const command = createRestoreKindStrategy("POSTGRESQL").command({ resetTarget: false });
    expect(command).not.toContain("DROP SCHEMA");
    expect(command).toContain("| psql -v ON_ERROR_STOP=1");
  });

  it("PostgreSQL espera o banco aceitar conexão (a cópia ainda está subindo)", () => {
    const command = createRestoreKindStrategy("POSTGRESQL").command({ resetTarget: false });
    expect(command).toContain('pg_isready -d "$SRC_URL"');
    expect(command.indexOf("pg_isready")).toBeLessThan(command.indexOf("mc cat"));
  });

  it("MySQL recria o banco no modo sobre o próprio banco e reaplica com mysql", () => {
    const command = createRestoreKindStrategy("MYSQL").command({ resetTarget: true });
    expect(command).toContain("mysqladmin ping");
    expect(command).toContain("DROP DATABASE IF EXISTS");
    expect(command).toContain('| mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASS" "$DB_NAME"');
  });

  it("MySQL como cópia só garante que o banco existe", () => {
    const command = createRestoreKindStrategy("MYSQL").command({ resetTarget: false });
    expect(command).not.toContain("DROP DATABASE");
    expect(command).toContain("CREATE DATABASE IF NOT EXISTS");
  });
});

describe("interpretRestoreJob", () => {
  it("dry-run (sem cluster) conclui na hora", () => {
    expect(interpretRestoreJob({ ready: true, message: "dry-run" }).status).toBe("COMPLETED");
  });

  it("Job com pod concluído com sucesso → COMPLETED", () => {
    expect(interpretRestoreJob({ ready: false, raw: { succeeded: 1 } }).status).toBe("COMPLETED");
  });

  it("Job com pod falho → FAILED com mensagem", () => {
    const progress = interpretRestoreJob({ ready: false, raw: { failed: 1 } });
    expect(progress.status).toBe("FAILED");
    expect(progress.message).toBeTruthy();
  });

  it("Job estourou o prazo (condição Failed) → FAILED", () => {
    const raw = { conditions: [{ type: "Failed", status: "True", reason: "DeadlineExceeded" }] };
    expect(interpretRestoreJob({ ready: false, raw }).status).toBe("FAILED");
  });

  it("Job ativo ou ilegível → RUNNING", () => {
    expect(interpretRestoreJob({ ready: false, raw: { active: 1 } }).status).toBe("RUNNING");
    expect(interpretRestoreJob({ ready: false, message: "connection refused" }).status).toBe(
      "RUNNING",
    );
  });
});

describe("restore de volume Longhorn", () => {
  const input = {
    name: "api-data-restore-abc123",
    namespace: "prod",
    backupUrl: "s3://bucket@us-east-1/?backup=backup-1&volume=pvc-1",
    sizeGi: 5,
    accessMode: "RWO" as const,
  };

  it("cria um Volume Longhorn a partir da URL do backup", () => {
    const volume = longhornRestoreVolumeManifest(input) as Record<string, any>;
    expect(volume.apiVersion).toBe("longhorn.io/v1beta2");
    expect(volume.kind).toBe("Volume");
    expect(volume.metadata).toMatchObject({ name: input.name, namespace: "longhorn-system" });
    expect(volume.spec.fromBackup).toBe(input.backupUrl);
    expect(volume.spec.size).toBe(String(5 * 1024 ** 3));
  });

  it("liga PV e PVC novos ao volume restaurado (o PVC original não é tocado)", () => {
    const pv = restoredPersistentVolumeManifest(input) as Record<string, any>;
    const pvc = restoredPvcManifest(input) as Record<string, any>;
    expect(pv.kind).toBe("PersistentVolume");
    expect(pv.spec.csi).toMatchObject({ driver: "driver.longhorn.io", volumeHandle: input.name });
    expect(pv.spec.persistentVolumeReclaimPolicy).toBe("Retain");
    expect(pvc.kind).toBe("PersistentVolumeClaim");
    expect(pvc.metadata).toMatchObject({ name: input.name, namespace: "prod" });
    expect(pvc.spec.volumeName).toBe(pv.metadata.name);
    expect(pvc.spec.accessModes).toEqual(["ReadWriteOnce"]);
  });

  it("interpreta o andamento do Volume restaurado", () => {
    expect(interpretLonghornRestore({ ready: true, message: "dry-run" }).status).toBe("COMPLETED");
    expect(
      interpretLonghornRestore({ ready: false, raw: { restoreRequired: true, state: "attached" } })
        .status,
    ).toBe("RUNNING");
    expect(
      interpretLonghornRestore({ ready: false, raw: { restoreRequired: false, state: "detached" } })
        .status,
    ).toBe("COMPLETED");
    expect(interpretLonghornRestore({ ready: false, raw: { robustness: "faulted" } }).status).toBe(
      "FAILED",
    );
  });
});
