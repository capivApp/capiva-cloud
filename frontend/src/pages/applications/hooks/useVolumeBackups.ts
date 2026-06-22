import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface VolumeBackup {
  id: string;
  kind: string;
  volumeId: string;
  storageProviderId: string | null;
  status: string;
  destination: string | null;
  startedAt: string;
  finishedAt: string | null;
}

/**
 * Hook de backups de um volume: listar, criar (snapshot→S3) e restaurar.
 * Snapshots via Longhorn enviados a um StorageProvider.
 */
export function useVolumeBackups(applicationId: string, volumeId: string) {
  const queryClient = useQueryClient();
  const key = ["volume-backups", applicationId, volumeId];
  const base = `/applications/${applicationId}/volumes/${volumeId}/backups`;

  const list = useQuery({
    queryKey: key,
    queryFn: () => api.get<VolumeBackup[]>(base),
    enabled: Boolean(applicationId && volumeId),
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: key });

  const createMut = useMutation({ mutationFn: (storageProviderId?: string) => api.post<VolumeBackup>(base, { storageProviderId }), onSuccess: invalidate });
  const restoreMut = useMutation({ mutationFn: (backupId: string) => api.post(`${base}/${backupId}/restore`, {}), onSuccess: invalidate });

  return {
    backups: list.data ?? [],
    isLoading: list.isLoading,
    create: createMut.mutateAsync,
    isCreating: createMut.isPending,
    restore: restoreMut.mutateAsync,
  };
}
