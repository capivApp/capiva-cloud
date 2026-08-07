import { useQuery } from "@tanstack/react-query";
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

  return {
    projects: list.data ?? [],
    isLoading: list.isLoading,
    refetch: list.refetch,
  };
}
