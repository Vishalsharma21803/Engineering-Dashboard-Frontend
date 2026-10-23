import { useQueryClient } from "@tanstack/react-query";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import { PageLoader } from "@/components/ui/page-loader";
import { authKeys } from "../api/auth.keys";
import { useAuth } from "../hooks/use-auth";
import { getPostLoginRedirect } from "../utils/redirect-path";

export function GuestRoute() {
  const { isAuthenticated, isLoading } = useAuth();
  const queryClient = useQueryClient();
  const location = useLocation();

  if (isLoading) {
    return <PageLoader label="Checking your session..." />;
  }

  // Sign-out clears the cache before the auth context re-renders; read it
  // directly so a just-signed-out user is not bounced away from /login.
  const isSignedOut = queryClient.getQueryData(authKeys.me) === null;

  if (isAuthenticated && !isSignedOut) {
    return (
      <Navigate to={getPostLoginRedirect(location.state)} replace />
    );
  }

  return <Outlet />;
}
