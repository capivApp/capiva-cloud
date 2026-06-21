import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore, type AuthUser } from "@/stores/useAuthStore";

interface AuthResponse {
  accessToken: string;
  user: AuthUser;
}

/**
 * Hook de autenticação. Encapsula o react-query e reexpõe suas funções —
 * as páginas nunca chamam useMutation/useQuery diretamente.
 */
export function useAuth() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const user = useAuthStore((s) => s.user);

  const loginMut = useMutation({
    mutationKey: ["auth", "login"],
    mutationFn: (input: { email: string; password: string }) =>
      api.post<AuthResponse>("/auth/login", input, { auth: false }),
    onSuccess: (data) => setAuth(data.accessToken, data.user),
  });

  const registerMut = useMutation({
    mutationKey: ["auth", "register"],
    mutationFn: (input: { email: string; name: string; password: string; organizationName?: string }) =>
      api.post<AuthResponse>("/auth/register", input, { auth: false }),
    onSuccess: (data) => setAuth(data.accessToken, data.user),
  });

  return {
    user,
    login: loginMut.mutateAsync,
    isLoggingIn: loginMut.isPending,
    loginError: loginMut.error as Error | null,
    register: registerMut.mutateAsync,
    isRegistering: registerMut.isPending,
    registerError: registerMut.error as Error | null,
  };
}
