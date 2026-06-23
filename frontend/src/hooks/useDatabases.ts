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
  /** Acesso externo (IP do nó + NodePort). null se indisponível/não suportado. */
  connectionUrlExternal: string | null;
  /** Topologia/saúde vivos do operator. */
  instances: number | null;
  readyInstances: number | null;
  phase: string | null;
  healthy: boolean;
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
  const removeMut = useMutation({ mutationKey: ["databases", "remove"], mutationFn: (id: string) => api.del(`/databases/${id}`) });

  return {
    databases: list.data ?? [],
    isLoading: list.isLoading,
    refetch: list.refetch,
    create: createMut.mutateAsync,
    isCreating: createMut.isPending,
    update: updateMut.mutateAsync,
    remove: removeMut.mutateAsync,
    isRemoving: removeMut.isPending,
    getDetail: (id: string) => api.get<DatabaseDetail>(`/databases/${id}`),
  };
}
