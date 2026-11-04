import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { buildPermissoesDaAplicacao, type Role } from "@/lib/permissions";
import { useAuthStore } from "@/stores/useAuthStore";

interface Member {
  userId: string;
  role: Role;
}

/**
 * Papel do usuário na organização ativa (lista de membros, aberta a VIEWER) e o
 * que ele pode fazer nas aplicações. Enquanto carrega, nada é permitido.
 */
export function useMyRole() {
  const organizationId = useAuthStore((s) => s.organizationId);
  const userId = useAuthStore((s) => s.user?.id ?? null);

  const members = useQuery({
    queryKey: ["members", organizationId],
    queryFn: () => api.get<Member[]>("/members"),
    enabled: Boolean(organizationId && userId),
    staleTime: 60_000,
  });

  const role = members.data?.find((m) => m.userId === userId)?.role ?? null;

  return {
    role,
    permissoes: buildPermissoesDaAplicacao(role),
    isLoading: members.isLoading,
    isFetching: members.isFetching,
    error: members.error as Error | null,
    refetch: members.refetch,
  };
}
