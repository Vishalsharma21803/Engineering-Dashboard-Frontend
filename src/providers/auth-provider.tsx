import { useQuery } from "@tanstack/react-query";
import { useMemo, type ReactNode } from "react";

import { getCurrentUser } from "@/features/auth/api/auth.api";
import { authKeys } from "@/features/auth/api/auth.keys";
import {
  AuthContext,
  type AuthContextValue,
} from "@/features/auth/context/auth-context";

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const { data: user = null, isLoading } = useQuery({
    queryKey: authKeys.me,
    queryFn: getCurrentUser,
    retry: false,
    staleTime: 5 * 60_000,
  });

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isLoading,
    }),
    [user, isLoading]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
