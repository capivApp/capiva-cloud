import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/useAuthStore";

export interface Project {
  id: string;
  name: string;
  slug: string;
}

export function useProjects() {
  const organizationId = useAuthStore((s) => s.organizationId);

  const list = useQuery({
    queryKey: ["projects", organizationId],
    queryFn: () => api.get<Project[]>("/projects"),
    enabled: Boolean(organizationId),
  });

  const createMut = useMutation({
    mutationKey: ["projects", "create"],
    mutationFn: (name: string) => api.post<Project>("/projects", { name }),
  });
  const updateMut = useMutation({ mutationKey: ["projects", "update"], mutationFn: ({ id, name }: { id: string; name: string }) => api.patch(`/projects/${id}`, { name }) });
  const removeMut = useMutation({ mutationKey: ["projects", "remove"], mutationFn: (id: string) => api.del(`/projects/${id}`) });

  return {
    projects: list.data ?? [],
    isLoading: list.isLoading,
    refetch: list.refetch,
    create: createMut.mutateAsync,
    isCreating: createMut.isPending,
    update: updateMut.mutateAsync,
    remove: removeMut.mutateAsync,
  };
}
