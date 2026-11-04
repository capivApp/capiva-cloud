import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

/**
 * Previews por PR de uma aplicação. A lista vem no detalhe da aplicação
 * (`previews` do GET /applications/:id); aqui ficam as ações.
 */
export function usePreviewDeployments(applicationId: string) {
  const queryClient = useQueryClient();

  const destroyMut = useMutation({
    mutationKey: ["application", "previews", "destroy", applicationId],
    mutationFn: (previewId: string) => api.del(`/applications/${applicationId}/previews/${previewId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["application", applicationId] }),
  });

  return {
    destroy: destroyMut.mutateAsync,
    isDestroying: destroyMut.isPending,
    destroyingId: destroyMut.isPending ? destroyMut.variables : null,
  };
}
