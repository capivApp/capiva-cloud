import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/useAuthStore";

export interface Organization {
  id: string;
  name: string;
  slug: string;
}

/** Organizações do usuário (multi-tenant). Compartilhado entre páginas. */
export function useOrganizations() {
  const list = useQuery({
    queryKey: ["organizations"],
    queryFn: () => api.get<Organization[]>("/organizations", { auth: true }),
  });

  const createMut = useMutation({
    mutationKey: ["organizations", "create"],
    mutationFn: (name: string) => api.post<Organization>("/organizations", { name }),
  });

  return {
    organizations: list.data ?? [],
    isLoading: list.isLoading,
    refetch: list.refetch,
    create: createMut.mutateAsync,
    setActive: useAuthStore.getState().setOrganization,
  };
}
