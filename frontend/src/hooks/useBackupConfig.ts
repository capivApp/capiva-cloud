import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/useAuthStore";

export interface BackupConfig {
  s3Endpoint: string;
  s3Bucket: string;
  s3Region: string | null;
  retentionDays: number;
  schedule: string;
}

export function useBackupConfig() {
  const organizationId = useAuthStore((s) => s.organizationId);

  const query = useQuery({
    queryKey: ["backup-config", organizationId],
    queryFn: () => api.get<BackupConfig | null>("/backup-config"),
    enabled: Boolean(organizationId),
  });

  const saveMut = useMutation({
    mutationKey: ["backup-config", "save"],
    mutationFn: (input: { s3Endpoint: string; s3Bucket: string; s3Region?: string; accessKeyId: string; secretAccessKey: string; retentionDays?: number; schedule?: string }) =>
      api.put("/backup-config", input),
  });

  return {
    config: query.data ?? null,
    isLoading: query.isLoading,
    refetch: query.refetch,
    save: saveMut.mutateAsync,
    isSaving: saveMut.isPending,
  };
}
