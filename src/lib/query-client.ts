import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
    mutations: {
      retry: 0,
    },
  },
});

export function clearPrivateQueries(client: QueryClient): void {
  client.removeQueries({
    predicate: (query) => query.queryKey[0] !== "auth",
  });
}
