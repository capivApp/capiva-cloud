import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/useAuthStore";

export interface AuditLog {
  id: string;
  event: string;
  userId: string | null;
  apiKeyId: string | null;
  targetType: string | null;
  targetId: string | null;
  detail: string | null;
  ip: string | null;
  at: string;
}

/** Hook de audit logs da organização (filtra por evento). */
export function useAuditLogs(event?: string) {
  const organizationId = useAuthStore((s) => s.organizationId);
  const qs = event ? `?event=${encodeURIComponent(event)}` : "";
  const query = useQuery({
    queryKey: ["audit", organizationId, event ?? "all"],
    queryFn: () => api.get<AuditLog[]>(`/audit${qs}`),
    enabled: Boolean(organizationId),
  });

  return { logs: query.data ?? [], isLoading: query.isLoading, error: query.error as Error | null };
}
