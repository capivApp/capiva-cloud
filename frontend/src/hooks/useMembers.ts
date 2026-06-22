import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/useAuthStore";

export type Role = "OWNER" | "ADMIN" | "DEVELOPER" | "VIEWER";

export interface Member {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: Role;
}

export interface Invitation {
  id: string;
  email: string;
  role: Role;
  token?: string;
  expiresAt: string;
}

/** Hook de membros + convites da organização (RBAC). */
export function useMembers() {
  const organizationId = useAuthStore((s) => s.organizationId);
  const queryClient = useQueryClient();
  const enabled = Boolean(organizationId);
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["members", organizationId] });
    queryClient.invalidateQueries({ queryKey: ["invitations", organizationId] });
  };

  const members = useQuery({ queryKey: ["members", organizationId], queryFn: () => api.get<Member[]>("/members"), enabled });
  const invitations = useQuery({ queryKey: ["invitations", organizationId], queryFn: () => api.get<Invitation[]>("/members/invitations"), enabled });

  const inviteMut = useMutation({ mutationFn: (input: { email: string; role: Role }) => api.post<Invitation>("/members/invitations", input), onSuccess: invalidate });
  const revokeMut = useMutation({ mutationFn: (id: string) => api.del(`/members/invitations/${id}`), onSuccess: invalidate });
  const changeRoleMut = useMutation({ mutationFn: ({ userId, role }: { userId: string; role: Role }) => api.patch(`/members/${userId}`, { role }), onSuccess: invalidate });
  const removeMut = useMutation({ mutationFn: (userId: string) => api.del(`/members/${userId}`), onSuccess: invalidate });

  return {
    members: members.data ?? [],
    invitations: invitations.data ?? [],
    isLoading: members.isLoading,
    invite: inviteMut.mutateAsync,
    isInviting: inviteMut.isPending,
    revoke: revokeMut.mutateAsync,
    changeRole: changeRoleMut.mutateAsync,
    remove: removeMut.mutateAsync,
  };
}
