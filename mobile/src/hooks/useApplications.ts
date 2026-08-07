import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface Application {
  id: string;
  name: string;
  source: string;
  profile: string;
  rolloutStrategy: string;
  observedStatus: string;
  desiredStatus: string;
  port: number | null;
  tags?: string[] | null;
  createdAt: string;
}

/** Lista de aplicações do projeto ativo. */
export function useApplications(projectId?: string | null) {
  const list = useQuery({
    queryKey: ["applications", projectId],
    queryFn: () => api.get<Application[]>(`/applications?projectId=${projectId}`),
    enabled: Boolean(projectId),
    refetchInterval: 15_000,
  });

  return {
    applications: list.data ?? [],
    isLoading: list.isLoading,
    error: list.error as Error | null,
    refetch: list.refetch,
    isFetching: list.isFetching,
  };
}

export interface CreateApplicationDTO {
  projectId: string;
  environmentId: string;
  name: string;
  source: string;
  gitConnectionId?: string;
  sourceConfig: Record<string, unknown>;
  profile: string;
  rolloutStrategy?: string;
  port: number;
  env?: { key: string; value: string }[];
  tags?: string[];
}

/** Criação de aplicação (o backend dispara o primeiro deploy automaticamente). */
export function useCreateApplication() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationKey: ["applications", "create"],
    mutationFn: (dto: CreateApplicationDTO) => api.post<Application>("/applications", dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["applications"] }),
  });

  return {
    create: mutation.mutateAsync,
    isCreating: mutation.isPending,
  };
}
