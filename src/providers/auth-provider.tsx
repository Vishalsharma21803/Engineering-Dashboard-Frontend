import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, type ReactNode } from "react";

import { getCurrentUser } from "@/features/auth/api/auth.api";
import { authKeys } from "@/features/auth/api/auth.keys";
import {
  AuthContext,
  type AuthContextValue,
} from "@/features/auth/context/auth-context";
import { UNAUTHORIZED_EVENT } from "@/lib/api-client";
import { clearPrivateQueries } from "@/lib/query-client";

interface AuthProviderProps {
  children: ReactNode;
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
    queryFn: getCurrentUser,
    retry: false,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    function handleUnauthorized() {
      queryClient.setQueryData(authKeys.me, null);
      clearPrivateQueries(queryClient);
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
