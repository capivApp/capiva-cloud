import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/useAuthStore";

export interface Environment {
  id: string;
  name: string;
  kind: "DEVELOPMENT" | "STAGING" | "PRODUCTION";
  namespace: string;
  clusterId: string | null;
}

export function useEnvironments() {
  const organizationId = useAuthStore((s) => s.organizationId);
  const list = useQuery({
    queryKey: ["environments", organizationId],
    queryFn: () => api.get<Environment[]>("/environments"),
    enabled: Boolean(organizationId),
  });

  return {
    environments: list.data ?? [],
    isLoading: list.isLoading,
    refetch: list.refetch,
  };
}
