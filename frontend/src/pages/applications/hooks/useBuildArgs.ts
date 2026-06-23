import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface BuildArg {
  key: string;
  value: string;
}

/**
 * Hook dos build args (ARG do Dockerfile) de uma aplicação. Diferente das
 * variáveis de runtime: viram `--build-arg` no próximo build, não env do pod.
 */
export function useBuildArgs(applicationId: string) {
  const queryClient = useQueryClient();
  const key = ["applications", applicationId, "build-args"];

  const list = useQuery({
    queryKey: key,
    queryFn: () => api.get<BuildArg[]>(`/applications/${applicationId}/build-args`),
    enabled: Boolean(applicationId),
  });

  const saveMut = useMutation({
    mutationFn: (buildArgs: BuildArg[]) => api.put<unknown>(`/applications/${applicationId}/build-args`, { buildArgs }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  return {
    buildArgs: list.data ?? [],
    isLoading: list.isLoading,
    save: saveMut.mutateAsync,
    isSaving: saveMut.isPending,
  };
}
