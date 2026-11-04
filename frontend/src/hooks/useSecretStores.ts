import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/useAuthStore";

export const SECRET_STORE_PROVIDERS = {
  AWS_SECRETS_MANAGER: "AWS Secrets Manager",
  VAULT: "HashiCorp Vault",
  GCP_SECRET_MANAGER: "GCP Secret Manager",
} as const;
export type SecretStoreProvider = keyof typeof SECRET_STORE_PROVIDERS;

export interface SecretStore {
  id: string;
  name: string;
  provider: SecretStoreProvider;
  config: Record<string, string>;
  createdAt: string;
}

export interface SecretStoreInput {
  name: string;
  provider: SecretStoreProvider;
  config: Record<string, string>;
  credentials: Record<string, string>;
}

/** Cofres externos da organização (External Secrets). Credenciais nunca voltam da API. */
export function useSecretStores() {
  const organizationId = useAuthStore((s) => s.organizationId);
  const queryClient = useQueryClient();
  const key = ["secret-stores", organizationId];

  const list = useQuery({
    queryKey: key,
    queryFn: () => api.get<SecretStore[]>("/secret-stores"),
    enabled: Boolean(organizationId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: key });

  const createMut = useMutation({
    mutationKey: ["secret-stores", "create"],
    mutationFn: (input: SecretStoreInput) => api.post<SecretStore>("/secret-stores", input),
    onSuccess: invalidate,
  });
  const removeMut = useMutation({
    mutationKey: ["secret-stores", "remove"],
    mutationFn: (id: string) => api.del(`/secret-stores/${id}`),
    onSuccess: invalidate,
  });

  return {
    stores: list.data ?? [],
    isLoading: list.isLoading,
    isFetching: list.isFetching,
    error: list.error as Error | null,
    refetch: list.refetch,
    create: createMut.mutateAsync,
    isCreating: createMut.isPending,
    remove: removeMut.mutateAsync,
  };
}
