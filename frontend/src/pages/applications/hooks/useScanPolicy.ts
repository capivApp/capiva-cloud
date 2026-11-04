import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Application } from "@/pages/applications/hooks/useApplications";
import type { ScanPolicy } from "@/pages/applications/components/scan/types";

/**
 * Política de scan de vulnerabilidades da aplicação. A leitura vem da própria
 * aplicação (`sourceConfig.security`); aqui fica só a gravação.
 */
export function useScanPolicy(applicationId: string) {
  const queryClient = useQueryClient();

  const saveMut = useMutation({
    mutationKey: ["application", "security", applicationId],
    mutationFn: (policy: ScanPolicy) =>
      api.put<Application>(`/applications/${applicationId}/security`, policy),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["application", applicationId] }),
  });

  return {
    save: saveMut.mutateAsync,
    isSaving: saveMut.isPending,
    error: saveMut.error,
  };
}
