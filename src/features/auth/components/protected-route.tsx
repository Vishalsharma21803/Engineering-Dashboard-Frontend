import {
  Navigate,
  Outlet,
  useLocation,
} from "react-router-dom";

import { PageLoader } from "@/components/ui/page-loader";
import { useAuth } from "../hooks/use-auth";

export function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <PageLoader
        label="Checking your session..."
        fullScreen={false}
      />
    );
  }

  if (!isAuthenticated) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location }}
      />
    );
  }

  return <Outlet />;
}
