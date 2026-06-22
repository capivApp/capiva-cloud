import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface GitRepo {
  id: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  private: boolean;
  cloneUrl: string;
}

/** Repositórios de uma conexão Git (GitHub/GitLab/Gitea). */
export function useGitRepos(connectionId: string | null) {
  return useQuery({
    queryKey: ["git-repos", connectionId],
    queryFn: () => api.get<GitRepo[]>(`/git-connections/${connectionId}/repos`),
    enabled: Boolean(connectionId),
    staleTime: 60_000,
  });
}

/** Branches de um repositório dentro de uma conexão Git. */
export function useGitBranches(connectionId: string | null, repo: string | null) {
  return useQuery({
    queryKey: ["git-branches", connectionId, repo],
    queryFn: () => api.get<string[]>(`/git-connections/${connectionId}/branches?repo=${encodeURIComponent(repo!)}`),
    enabled: Boolean(connectionId && repo),
    staleTime: 60_000,
  });
}
