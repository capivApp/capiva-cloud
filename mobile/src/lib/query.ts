import { QueryClient } from "@tanstack/react-query";

/** QueryClient único do app (espelho do painel web). */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      retry: 1,
    },
  },
});
