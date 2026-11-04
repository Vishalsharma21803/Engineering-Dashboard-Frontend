import {
  Navigate,
  Outlet,
  useLocation,
} from "react-router-dom";

import { PageLoader } from "@/components/ui/page-loader";
import { useAuth } from "../hooks/use-auth";
import { isSessionExpired } from "../utils/session-expiry";
import { ServerUnavailable } from "./server-unavailable";

export function ProtectedRoute() {
  const { isAuthenticated, isLoading, error, retry, isRetrying } =
    useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <PageLoader
        label="Checking your session..."
        fullScreen={false}
      />
    );
  }

  // Only a 401 signs out; a failed check keeps the user here with a retry.
  if (!isAuthenticated && error && retry) {
    return (
      <ServerUnavailable
        onRetry={retry}
        isRetrying={isRetrying ?? false}
      />
    );
  }

  if (!isAuthenticated) {
    return (
      <Navigate
        to="/login"
        replace
        state={{
          from: location,
          // The session ended on its own (a 401), not by signing out.
          ...(isSessionExpired() ? { reason: "expired" } : {}),
        }}
      />
    );
  }

  return <Outlet />;
}
