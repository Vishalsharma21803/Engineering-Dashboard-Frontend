import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, type ReactNode } from "react";

import { getCurrentUser } from "@/features/auth/api/auth.api";
import { authKeys } from "@/features/auth/api/auth.keys";
import {
  AuthContext,
  type AuthContextValue,
} from "@/features/auth/context/auth-context";
import type { User } from "@/features/auth/types/auth.types";
import { markSessionExpired } from "@/features/auth/utils/session-expiry";
import { bumpSessionEpoch, currentSessionEpoch, UNAUTHORIZED_EVENT } from "@/lib/api-client";
import { clearGlobalNotices } from "@/lib/global-errors";
import { clearPrivateQueries } from "@/lib/query-client";

interface AuthProviderProps {
  children: ReactNode;
}

/**
 * The session ended without a sign-out: remember that (the sign-in page says so),
 * ignore answers to requests from the old session and drop its private data.
 */
function endExpiredSession(queryClient: QueryClient): void {
  if (queryClient.getQueryData<User | null>(authKeys.me)) {
    markSessionExpired();
  }

  bumpSessionEpoch();
  clearPrivateQueries(queryClient);
  clearGlobalNotices();
}

export function AuthProvider({ children }: AuthProviderProps) {
  const queryClient = useQueryClient();
  // getCurrentUser resolves to null on a 401; anything else it throws stays
  // an error here, so a server outage is not mistaken for a sign-out.
  const {
    data: user = null,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: authKeys.me,
    // A 401 when re-checking (reconnect, refetch) while signed in is an expired session too.
    queryFn: async () => {
      const startedInEpoch = currentSessionEpoch();
      const current = await getCurrentUser();

      // Signed in or out while this check ran: its answer is about the old session; keep the new one.
      if (startedInEpoch !== currentSessionEpoch()) {
        return queryClient.getQueryData<User | null>(authKeys.me) ?? null;
      }

      if (current === null && queryClient.getQueryData<User | null>(authKeys.me)) {
        endExpiredSession(queryClient);
      }

      return current;
    },
    retry: false,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    function handleUnauthorized() {
      endExpiredSession(queryClient);
      queryClient.setQueryData(authKeys.me, null);
    }

    window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);

    return () => {
      window.removeEventListener(
        UNAUTHORIZED_EVENT,
        handleUnauthorized
      );
    };
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isLoading,
      error,
      retry: () => void refetch(),
      isRetrying: isFetching,
    }),
    [user, isLoading, error, refetch, isFetching]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
