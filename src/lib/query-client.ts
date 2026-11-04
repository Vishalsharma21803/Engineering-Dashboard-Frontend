import { QueryClient } from "@tanstack/react-query";

import { retryUnlessClientError } from "@/lib/query-retry";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: retryUnlessClientError,
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
  // Mutation variables can hold secrets (a PAT, an AI key, a Solidtime token).
  client.getMutationCache().clear();
}
