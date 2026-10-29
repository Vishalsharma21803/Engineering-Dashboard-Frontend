import { createContext } from "react";

import type { User } from "../types/auth.types";

export interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  // The fields below are optional so test doubles of this context can omit them.
  /**
   * Why the session could not be checked (server error or unreachable). Only
   * a 401 means signed out; this is never set for one.
   */
  error?: Error | null;
  /** Checks the session again after `error`. */
  retry?: () => void;
  isRetrying?: boolean;
}

export const AuthContext = createContext<AuthContextValue | null>(
  null
);
