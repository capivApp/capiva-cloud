import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import { api } from "@/lib/api";
import { queryClient } from "@/query";
import { useAuthStore } from "@/stores/useAuthStore";

/**
 * Providers globais + bootstrap de sessão: ao carregar, tenta um refresh
 * silencioso (cookie HttpOnly) para restaurar a sessão sem novo login.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.post<{ accessToken: string; user: any }>("/auth/refresh", undefined, {
          auth: false,
        });
        setAuth(data.accessToken, data.user);
      } catch {
        // sem sessão válida — segue para login
      } finally {
        setReady(true);
      }
    })();
  }, [setAuth]);

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-muted-foreground">
        Carregando…
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster theme="dark" position="bottom-right" richColors />
    </QueryClientProvider>
  );
}
