import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type RestoreStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
export type RestoreMode = "IN_PLACE" | "AS_COPY";

export interface BackupRestore {
  id: string;
  backupId: string;
  kind: "DATABASE" | "VOLUME";
  mode: RestoreMode;
  status: RestoreStatus;
  sourceDatabaseId: string | null;
  targetDatabaseId: string | null;
  volumeId: string | null;
  targetName: string | null;
  message: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export type DatabaseRestoreInput = { mode: "IN_PLACE"; confirmName: string } | { mode: "AS_COPY"; newName: string };

const POLL_MS = 3000;
const isInFlight = (restore: BackupRestore) => restore.status === "PENDING" || restore.status === "RUNNING";

/** Polling só enquanto houver restore em andamento: o backend lê o Job a cada consulta. */
const pollWhileInFlight = (restores: BackupRestore[] | undefined) => ((restores ?? []).some(isInFlight) ? POLL_MS : false);

/** Restores de um banco: listar (com andamento) e pedir um restore de um backup. */
export function useDatabaseRestores(databaseId: string | null) {
  const queryClient = useQueryClient();
  const key = ["database-restores", databaseId];

  const list = useQuery({
    queryKey: key,
    queryFn: () => api.get<BackupRestore[]>(`/databases/${databaseId}/restores`),
    enabled: Boolean(databaseId),
    refetchInterval: (query) => pollWhileInFlight(query.state.data),
  });

  const restoreMut = useMutation({
    mutationFn: ({ backupId, input }: { backupId: string; input: DatabaseRestoreInput }) =>
      api.post<BackupRestore>(`/databases/${databaseId}/backups/${backupId}/restore`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: key });
      // A cópia é um banco novo na lista do projeto.
      queryClient.invalidateQueries({ queryKey: ["databases"] });
    },
  });

  return {
    restores: list.data ?? [],
    isLoading: list.isLoading,
    isFetching: list.isFetching,
    error: list.error,
    refetch: list.refetch,
    restore: restoreMut.mutateAsync,
    isRestoring: restoreMut.isPending,
  };
}

/** Restores de um volume: listar (com andamento) e restaurar um backup num volume novo. */
export function useVolumeRestores(applicationId: string, volumeId: string) {
  const queryClient = useQueryClient();
  const key = ["volume-restores", applicationId, volumeId];
  const base = `/applications/${applicationId}/volumes/${volumeId}`;

  const list = useQuery({
    queryKey: key,
    queryFn: () => api.get<BackupRestore[]>(`${base}/restores`),
    enabled: Boolean(applicationId && volumeId),
    refetchInterval: (query) => pollWhileInFlight(query.state.data),
  });

  const restoreMut = useMutation({
    mutationFn: (backupId: string) => api.post<BackupRestore>(`${base}/backups/${backupId}/restore`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  return {
    restores: list.data ?? [],
    isLoading: list.isLoading,
    isFetching: list.isFetching,
    error: list.error,
    refetch: list.refetch,
    restore: restoreMut.mutateAsync,
    isRestoring: restoreMut.isPending,
  };
}
