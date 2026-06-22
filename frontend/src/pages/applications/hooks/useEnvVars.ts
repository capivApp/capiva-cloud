import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface EnvVar {
  id: string;
  key: string;
  value: string;
  secret: boolean;
  source: "MANUAL" | "INJECTED";
  overridden: boolean;
  /** Indica que há valor armazenado (segredos vêm mascarados). */
  hasValue: boolean;
}

export interface EnvVarInput {
  key: string;
  value: string;
  secret: boolean;
}

/**
 * Hook da feature "variáveis de ambiente" de uma aplicação. Encapsula
 * react-query (listar/substituir em lote/remover) e invalida após mutações.
 */
export function useEnvVars(applicationId: string) {
  const queryClient = useQueryClient();
  const key = ["applications", applicationId, "env"];

  const list = useQuery({
    queryKey: key,
    queryFn: () => api.get<EnvVar[]>(`/applications/${applicationId}/env`),
    enabled: Boolean(applicationId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: key });

  const saveMut = useMutation({
    mutationFn: (vars: EnvVarInput[]) => api.put<EnvVar[]>(`/applications/${applicationId}/env`, { vars }),
    onSuccess: invalidate,
  });
  const removeMut = useMutation({
    mutationFn: (envKey: string) => api.del(`/applications/${applicationId}/env/${encodeURIComponent(envKey)}`),
    onSuccess: invalidate,
  });

  return {
    vars: list.data ?? [],
    isLoading: list.isLoading,
    error: list.error as Error | null,
    save: saveMut.mutateAsync,
    isSaving: saveMut.isPending,
    remove: removeMut.mutateAsync,
  };
}
