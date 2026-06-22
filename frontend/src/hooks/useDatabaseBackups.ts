import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface DatabaseBackup {
  id: string;
  kind: string;
  databaseId: string;
  storageProviderId: string | null;
  status: string;
  destination: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface RunBackupInput {
  scope?: "single" | "all";
  mode?: "full" | "incremental";
  storageProviderId?: string;
}

/** Hook de backups de um banco gerenciado: listar e disparar (dump → S3). */
export function useDatabaseBackups(databaseId: string | null) {
  const queryClient = useQueryClient();
  const key = ["database-backups", databaseId];

  const list = useQuery({
    queryKey: key,
    queryFn: () => api.get<DatabaseBackup[]>(`/databases/${databaseId}/backups`),
    enabled: Boolean(databaseId),
  });

  const runMut = useMutation({
    mutationFn: (input: RunBackupInput) => api.post<DatabaseBackup>(`/databases/${databaseId}/backups`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  const restoreMut = useMutation({
    mutationFn: (backupId: string) => api.post<DatabaseBackup>(`/databases/${databaseId}/backups/${backupId}/restore`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  return {
    backups: list.data ?? [],
    isLoading: list.isLoading,
    run: runMut.mutateAsync,
    isRunning: runMut.isPending,
    restore: restoreMut.mutateAsync,
    isRestoring: restoreMut.isPending,
  };
}
