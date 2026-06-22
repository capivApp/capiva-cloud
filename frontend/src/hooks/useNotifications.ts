import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/useAuthStore";

export type NotificationType = "DISCORD" | "SLACK" | "TELEGRAM" | "TEAMS" | "EMAIL" | "RESEND" | "LARK" | "PUSH" | "WEBHOOK";

export interface NotificationChannel {
  id: string;
  type: NotificationType;
  name: string;
  events: string[];
  enabled: boolean;
  createdAt: string;
}

export interface CreateChannelInput {
  type: NotificationType;
  name: string;
  config: Record<string, unknown>;
  events: string[];
  enabled?: boolean;
}

/** Hook de canais de notificação (org): N por tipo, cada um com seus eventos. */
export function useNotifications() {
  const organizationId = useAuthStore((s) => s.organizationId);
  const queryClient = useQueryClient();
  const key = ["notifications", organizationId];

  const list = useQuery({ queryKey: key, queryFn: () => api.get<NotificationChannel[]>("/notifications"), enabled: Boolean(organizationId) });
  const events = useQuery({ queryKey: ["notification-events"], queryFn: () => api.get<string[]>("/notifications/events") });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: key });

  const createMut = useMutation({ mutationFn: (input: CreateChannelInput) => api.post<NotificationChannel>("/notifications", input), onSuccess: invalidate });
  const testMut = useMutation({ mutationFn: (id: string) => api.post(`/notifications/${id}/test`, {}) });
  const removeMut = useMutation({ mutationFn: (id: string) => api.del(`/notifications/${id}`), onSuccess: invalidate });

  return {
    channels: list.data ?? [],
    events: events.data ?? [],
    isLoading: list.isLoading,
    create: createMut.mutateAsync,
    isCreating: createMut.isPending,
    test: testMut.mutateAsync,
    remove: removeMut.mutateAsync,
  };
}
