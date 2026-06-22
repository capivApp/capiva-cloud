import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/useAuthStore";

export interface StorageProvider {
  id: string;
  name: string;
  type: "S3";
  endpoint: string;
  bucket: string;
  region: string | null;
  isDefault: boolean;
  createdAt: string;
}

export interface CreateStorageProviderInput {
  name: string;
  endpoint: string;
  bucket: string;
  region?: string;
  accessKeyId: string;
  secretAccessKey: string;
  isDefault?: boolean;
}

/** Hook de provedores de storage (S3) da org: listar/criar/remover. */
export function useStorageProviders() {
  const organizationId = useAuthStore((s) => s.organizationId);
  const queryClient = useQueryClient();
  const key = ["storage-providers", organizationId];

  const list = useQuery({
    queryKey: key,
    queryFn: () => api.get<StorageProvider[]>("/storage-providers"),
    enabled: Boolean(organizationId),
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: key });

  const createMut = useMutation({ mutationFn: (input: CreateStorageProviderInput) => api.post<StorageProvider>("/storage-providers", input), onSuccess: invalidate });
  const removeMut = useMutation({ mutationFn: (id: string) => api.del(`/storage-providers/${id}`), onSuccess: invalidate });

  return {
    providers: list.data ?? [],
    isLoading: list.isLoading,
    create: createMut.mutateAsync,
    isCreating: createMut.isPending,
    remove: removeMut.mutateAsync,
  };
}
