import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/useAuthStore";

export interface Organization {
  id: string;
  name: string;
  slug: string;
}

/** Organizações do usuário (multi-tenant). */
export function useOrganizations() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const list = useQuery({
    queryKey: ["organizations"],
    queryFn: () => api.get<Organization[]>("/organizations"),
    enabled: Boolean(accessToken),
  });

  return {
    organizations: list.data ?? [],
    isLoading: list.isLoading,
    refetch: list.refetch,
    setActive: useAuthStore.getState().setOrganization,
  };
}
