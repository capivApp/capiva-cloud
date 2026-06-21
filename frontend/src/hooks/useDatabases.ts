import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface ManagedDatabase {
  id: string;
  name: string;
  kind: string;
  size: string;
  highAvailability: boolean;
  observedStatus: string;
}

export interface DatabaseDetail extends ManagedDatabase {
  username: string;
  database: string;
  connectionUrl: string;
  backup: { enabled: boolean; schedule: string; retentionDays: number };
}

export interface CreateDatabaseDTO {
  projectId: string;
  environmentId: string;
  name: string;
  kind: string;
  size?: string;
  highAvailability?: boolean;
  username?: string;
  password?: string;
  database?: string;
  backupEnabled?: boolean;
  backupSchedule?: string;
  retentionDays?: number;
}

export function useDatabases(projectId?: string | null) {
  const list = useQuery({
    queryKey: ["databases", projectId],
    queryFn: () => api.get<ManagedDatabase[]>(`/databases?projectId=${projectId}`),
    enabled: Boolean(projectId),
  });

  const createMut = useMutation({ mutationKey: ["databases", "create"], mutationFn: (dto: CreateDatabaseDTO) => api.post<ManagedDatabase>("/databases", dto) });
  const updateMut = useMutation({ mutationKey: ["databases", "update"], mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) => api.patch(`/databases/${id}`, patch) });

  return {
    databases: list.data ?? [],
    isLoading: list.isLoading,
    refetch: list.refetch,
    create: createMut.mutateAsync,
    isCreating: createMut.isPending,
    update: updateMut.mutateAsync,
    getDetail: (id: string) => api.get<DatabaseDetail>(`/databases/${id}`),
  };
}
