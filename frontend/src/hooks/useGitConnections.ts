import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/useAuthStore";

export interface GitConnection {
  id: string;
  provider: "GITHUB" | "GITLAB" | "GITEA";
  accountLogin: string | null;
  baseUrl: string | null;
}

export function useGitConnections() {
  const organizationId = useAuthStore((s) => s.organizationId);

  const list = useQuery({
    queryKey: ["git-connections", organizationId],
    queryFn: () => api.get<GitConnection[]>("/git-connections"),
    enabled: Boolean(organizationId),
  });

  const createMut = useMutation({
    mutationKey: ["git-connections", "create"],
    mutationFn: (input: { provider: string; accessToken: string; accountLogin?: string; baseUrl?: string }) =>
      api.post<GitConnection>("/git-connections", input),
  });
  const updateMut = useMutation({
    mutationKey: ["git-connections", "update"],
    mutationFn: ({ id, patch }: { id: string; patch: { accessToken?: string; accountLogin?: string; baseUrl?: string } }) =>
      api.patch(`/git-connections/${id}`, patch),
  });
  const removeMut = useMutation({ mutationKey: ["git-connections", "remove"], mutationFn: (id: string) => api.del(`/git-connections/${id}`) });

  return {
    connections: list.data ?? [],
    isLoading: list.isLoading,
    refetch: list.refetch,
    create: createMut.mutateAsync,
    isCreating: createMut.isPending,
    update: updateMut.mutateAsync,
    remove: removeMut.mutateAsync,
  };
}
