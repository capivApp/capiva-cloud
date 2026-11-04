import type { K8sManifest, ObservedStatus } from "@interface/integrations";
import type { RestoreStatus } from "@prisma-generated/client";

/** Label que liga Job/PVC/Volume restaurado ao registro `BackupRestore`. */
export const RESTORE_LABEL = "capiva.cloud/restore-id";

const LONGHORN_NAMESPACE = "longhorn-system";
const LONGHORN_STORAGE_CLASS = process.env.CAPIVA_STORAGE_CLASS || "longhorn";
const GIBIBYTE = 1024 ** 3;

const restoreLabels = (name: string, restoreId: string) => ({
  "app.kubernetes.io/name": name,
  "app.kubernetes.io/part-of": "capiva",
  [RESTORE_LABEL]: restoreId,
});

export interface RestoreProgress {
  status: RestoreStatus;
  message?: string;
}

export interface DatabaseRestoreJobInput {
  name: string;
  namespace: string;
  command: string;
  secretName: string;
  restoreId: string;
}

/**
 * Job de restore de banco: baixa o dump do S3 e reaplica no destino. Roda UMA
 * vez (`backoffLimit: 0`): no modo cópia, reexecutar duplicaria linhas. O TTL
 * longo mantém o Job legível até o próximo polling do status.
 */
export function databaseRestoreJobManifest(input: DatabaseRestoreJobInput): K8sManifest {
  const labels = restoreLabels(input.name, input.restoreId);
  return {
    apiVersion: "batch/v1",
    kind: "Job",
    metadata: { name: input.name, namespace: input.namespace, labels },
    spec: {
      backoffLimit: 0,
      activeDeadlineSeconds: Number(process.env.CAPIVA_DB_RESTORE_DEADLINE_SECONDS || 6 * 3600),
      ttlSecondsAfterFinished: 86_400,
      template: {
        metadata: { labels },
        spec: {
          restartPolicy: "Never",
          containers: [
            {
              name: "restore",
              image: process.env.CAPIVA_DB_BACKUP_IMAGE || "ghcr.io/capiva/db-backup:latest",
              command: ["sh", "-c", input.command],
              envFrom: [{ secretRef: { name: input.secretName } }],
            },
          ],
        },
      },
    },
  };
}

type ProgressRule = {
  matches: (observed: ObservedStatus) => boolean;
  progress: (observed: ObservedStatus) => RestoreProgress;
};

const isDryRun = (observed: ObservedStatus) => observed.message === "dry-run";
const rawOf = (observed: ObservedStatus) => observed.raw ?? {};
const numberOf = (value: unknown) => Number(value ?? 0);
const hasFailedCondition = (observed: ObservedStatus) =>
  ((rawOf(observed).conditions as { type?: string; status?: string }[] | undefined) ?? []).some(
    (condition) => condition.type === "Failed" && condition.status === "True",
  );

const firstMatch = (rules: ProgressRule[], observed: ObservedStatus): RestoreProgress =>
  rules.find((rule) => rule.matches(observed))?.progress(observed) ?? { status: "RUNNING" };

const JOB_RULES: ProgressRule[] = [
  { matches: isDryRun, progress: () => ({ status: "COMPLETED" }) },
  { matches: (o) => numberOf(rawOf(o).succeeded) > 0, progress: () => ({ status: "COMPLETED" }) },
  {
    matches: (o) => numberOf(rawOf(o).failed) > 0 || hasFailedCondition(o),
    progress: () => ({
      status: "FAILED",
      message: "O restore falhou. Confira os logs do Job no cluster.",
    }),
  },
];

/** Andamento do restore lido do status do Job. Ilegível = ainda executando. */
export const interpretRestoreJob = (observed: ObservedStatus): RestoreProgress =>
  firstMatch(JOB_RULES, observed);

const LONGHORN_RULES: ProgressRule[] = [
  { matches: isDryRun, progress: () => ({ status: "COMPLETED" }) },
  {
    matches: (o) => rawOf(o).robustness === "faulted",
    progress: () => ({
      status: "FAILED",
      message: "O volume restaurado ficou indisponível no Longhorn.",
    }),
  },
  {
    matches: (o) =>
      rawOf(o).restoreRequired === false &&
      ["attached", "detached"].includes(String(rawOf(o).state)),
    progress: () => ({ status: "COMPLETED" }),
  },
];

/** Andamento do Volume Longhorn criado a partir do backup. */
export const interpretLonghornRestore = (observed: ObservedStatus): RestoreProgress =>
  firstMatch(LONGHORN_RULES, observed);

export interface VolumeRestoreInput {
  /** Nome do Volume Longhorn, do PV e do PVC restaurados (o mesmo nos três). */
  name: string;
  namespace: string;
  /** URL do backup no backupTarget (`status.url` do Backup CR do Longhorn). */
  backupUrl: string;
  sizeGi: number;
  accessMode: "RWO" | "RWX";
  restoreId?: string;
}

const ACCESS_MODES: Record<VolumeRestoreInput["accessMode"], { k8s: string; longhorn: string }> = {
  RWO: { k8s: "ReadWriteOnce", longhorn: "rwo" },
  RWX: { k8s: "ReadWriteMany", longhorn: "rwx" },
};

const volumeLabels = (input: VolumeRestoreInput) =>
  restoreLabels(input.name, input.restoreId ?? input.name);

/** Volume Longhorn NOVO restaurado do backup. O volume original não é tocado. */
export function longhornRestoreVolumeManifest(input: VolumeRestoreInput): K8sManifest {
  return {
    apiVersion: "longhorn.io/v1beta2",
    kind: "Volume",
    metadata: { name: input.name, namespace: LONGHORN_NAMESPACE, labels: volumeLabels(input) },
    spec: {
      fromBackup: input.backupUrl,
      size: String(input.sizeGi * GIBIBYTE),
      numberOfReplicas: Number(process.env.CAPIVA_LONGHORN_REPLICAS || 2),
      frontend: "blockdev",
      accessMode: ACCESS_MODES[input.accessMode].longhorn,
    },
  };
}

/** PV estático apontando para o Volume Longhorn restaurado (Retain: nada some sozinho). */
export function restoredPersistentVolumeManifest(input: VolumeRestoreInput): K8sManifest {
  return {
    apiVersion: "v1",
    kind: "PersistentVolume",
    metadata: { name: input.name, labels: volumeLabels(input) },
    spec: {
      capacity: { storage: `${input.sizeGi}Gi` },
      accessModes: [ACCESS_MODES[input.accessMode].k8s],
      persistentVolumeReclaimPolicy: "Retain",
      storageClassName: LONGHORN_STORAGE_CLASS,
      csi: { driver: "driver.longhorn.io", fsType: "ext4", volumeHandle: input.name },
    },
  };
}

/** PVC novo, no namespace da aplicação, preso ao PV restaurado. */
export function restoredPvcManifest(input: VolumeRestoreInput): K8sManifest {
  return {
    apiVersion: "v1",
    kind: "PersistentVolumeClaim",
    metadata: { name: input.name, namespace: input.namespace, labels: volumeLabels(input) },
    spec: {
      accessModes: [ACCESS_MODES[input.accessMode].k8s],
      storageClassName: LONGHORN_STORAGE_CLASS,
      volumeName: input.name,
      resources: { requests: { storage: `${input.sizeGi}Gi` } },
    },
  };
}
