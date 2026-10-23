import { Navigate, Outlet } from "react-router-dom";

import { PageLoader } from "@/components/ui/page-loader";
import { useAuth } from "../hooks/use-auth";

export function GuestRoute() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <PageLoader label="Checking your session..." />;
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
