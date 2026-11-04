import { z } from "zod";
import { restoreBackupSchema } from "@schemas/restore.schema";

/**
 * Paths do restore de backup (banco e volume). Ficam num módulo próprio para o
 * `document.ts` só espalhar o objeto, sem crescer a cada recurso novo.
 */
const backupRestoreSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    organizationId: { type: "string" },
    backupId: { type: "string" },
    kind: { type: "string", enum: ["DATABASE", "VOLUME"] },
    mode: { type: "string", enum: ["IN_PLACE", "AS_COPY"] },
    status: { type: "string", enum: ["PENDING", "RUNNING", "COMPLETED", "FAILED"] },
    sourceDatabaseId: { type: ["string", "null"] },
    targetDatabaseId: {
      type: ["string", "null"],
      description: "Banco que recebeu o dump (o próprio ou a cópia).",
    },
    volumeId: { type: ["string", "null"] },
    targetName: {
      type: ["string", "null"],
      description: "Nome do banco de destino ou do PVC restaurado.",
    },
    jobName: {
      type: ["string", "null"],
      description: "Job (banco) ou Volume Longhorn (volume) acompanhado.",
    },
    message: { type: ["string", "null"] },
    requestedBy: { type: ["string", "null"] },
    startedAt: { type: "string", format: "date-time" },
    finishedAt: { type: ["string", "null"], format: "date-time" },
  },
} as const;

const restoreExample = {
  id: "cm3restore01",
  backupId: "cm3backup01",
  kind: "DATABASE",
  mode: "AS_COPY",
  status: "RUNNING",
  sourceDatabaseId: "cm3db01",
  targetDatabaseId: "cm3db02",
  targetName: "orders-copia",
  jobName: "orders-copia-restore-ore01",
  message: null,
  startedAt: "2026-11-04T12:00:00.000Z",
  finishedAt: null,
};

const restoreResponse = (description: string) => ({
  description,
  content: { "application/json": { schema: backupRestoreSchema, example: restoreExample } },
});
const restoreListResponse = {
  description: "OK",
  content: {
    "application/json": {
      schema: { type: "array", items: backupRestoreSchema },
      example: [restoreExample],
    },
  },
};

const path = (name: string) => ({ name, in: "path", required: true, schema: { type: "string" } });

export function buildRestorePaths(
  bearer: { bearerAuth: string[] }[],
  orgHeader: Record<string, unknown>,
): Record<string, unknown> {
  const parameters = (...names: string[]) => [...names.map(path), orgHeader];
  return {
    "/databases/{id}/backups/{backupId}/restore": {
      post: {
        tags: ["Databases"],
        summary: "Restaurar backup de banco",
        description:
          "Dispara um Job no cluster que baixa o dump do S3 e o reaplica (psql/mysql). `IN_PLACE` sobrescreve o próprio banco e exige `confirmName` igual ao nome do banco. `AS_COPY` cria um banco novo (`newName`) pelo fluxo normal de criação e restaura nele. Só PostgreSQL e MySQL; os demais tipos respondem 400. Acompanhe o andamento em `GET /databases/{id}/restores/{restoreId}`.",
        security: bearer,
        parameters: parameters("id", "backupId"),
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: z.toJSONSchema(restoreBackupSchema),
              examples: {
                sobreOBanco: { value: { mode: "IN_PLACE", confirmName: "orders-db" } },
                comoCopia: { value: { mode: "AS_COPY", newName: "orders-copia" } },
              },
            },
          },
        },
        responses: {
          "202": restoreResponse("Restore iniciado"),
          "400": {
            description:
              "Tipo sem suporte, confirmação errada, backup não concluído ou de vários bancos",
          },
          "404": { description: "Banco ou backup fora da organização ativa" },
          "409": { description: "Já existe um banco com o nome da cópia no ambiente" },
          "422": { description: "Corpo inválido" },
        },
      },
    },
    "/databases/{id}/restores": {
      get: {
        tags: ["Databases"],
        summary: "Listar restores do banco (com andamento atualizado)",
        security: bearer,
        parameters: parameters("id"),
        responses: {
          "200": restoreListResponse,
          "404": { description: "Banco fora da organização ativa" },
        },
      },
    },
    "/databases/{id}/restores/{restoreId}": {
      get: {
        tags: ["Databases"],
        summary: "Andamento de um restore",
        description:
          "Lê o Job no cluster e grava o desfecho (COMPLETED/FAILED). Ao terminar, o Secret efêmero é apagado.",
        security: bearer,
        parameters: parameters("id", "restoreId"),
        responses: {
          "200": restoreResponse("OK"),
          "404": { description: "Restore não encontrado" },
        },
      },
    },
    "/applications/{id}/volumes/{volId}/backups/{backupId}/restore": {
      post: {
        tags: ["Applications"],
        summary: "Restaurar backup de volume num volume novo",
        description:
          "Cria um Volume Longhorn a partir do backup (`fromBackup`), com PV e PVC novos no namespace da aplicação. O volume em uso não é alterado.",
        security: bearer,
        parameters: parameters("id", "volId", "backupId"),
        responses: {
          "202": restoreResponse("Restore iniciado"),
          "400": { description: "Backup não concluído" },
          "404": { description: "Volume ou backup não encontrado" },
        },
      },
    },
    "/applications/{id}/volumes/{volId}/restores": {
      get: {
        tags: ["Applications"],
        summary: "Listar restores do volume (com andamento atualizado)",
        security: bearer,
        parameters: parameters("id", "volId"),
        responses: { "200": restoreListResponse, "404": { description: "Volume não encontrado" } },
      },
    },
  };
}
