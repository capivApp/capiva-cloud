import { QueryClient } from "@tanstack/react-query";

/**
 * QueryClient global. Mutations invalidam queries ativas automaticamente
 * (padrão herdado do BasePage) para manter a UI reativa sem chamadas manuais.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5_000,
    },
    mutations: {
      onSuccess: () => {
        queryClient.invalidateQueries();
      },
    },
  },
});
