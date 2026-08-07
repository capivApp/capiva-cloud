import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/useAuthStore";

export interface GitConnection {
  id: string;
  provider: "GITHUB" | "GITLAB" | "GITEA";
  accountLogin: string | null;
  baseUrl: string | null;
}

export interface GitRepo {
  id: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  private: boolean;
  cloneUrl: string;
}

export function useGitConnections() {
  const organizationId = useAuthStore((s) => s.organizationId);
  const list = useQuery({
    queryKey: ["git-connections", organizationId],
    queryFn: () => api.get<GitConnection[]>("/git-connections"),
    enabled: Boolean(organizationId),
  });

  return {
    connections: list.data ?? [],
    isLoading: list.isLoading,
  };
}

/** Repositórios de uma conexão Git (GitHub/GitLab/Gitea). */
export function useGitRepos(connectionId: string | null) {
  const list = useQuery({
    queryKey: ["git-repos", connectionId],
    queryFn: () => api.get<GitRepo[]>(`/git-connections/${connectionId}/repos`),
    enabled: Boolean(connectionId),
    staleTime: 60_000,
  });

  return {
    repos: list.data ?? [],
    isLoading: list.isLoading,
  };
}

/** Branches de um repositório dentro de uma conexão Git. */
export function useGitBranches(connectionId: string | null, repo: string | null) {
  const list = useQuery({
    queryKey: ["git-branches", connectionId, repo],
    queryFn: () => api.get<string[]>(`/git-connections/${connectionId}/branches?repo=${encodeURIComponent(repo!)}`),
    enabled: Boolean(connectionId && repo),
    staleTime: 60_000,
  });

  return {
    branches: list.data ?? [],
    isLoading: list.isLoading,
  };
}
