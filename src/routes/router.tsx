import { createBrowserRouter } from "react-router-dom";

import { RootLayout } from "@/components/layout/root-layout";
import { AuthLayout } from "@/features/auth/components/auth-layout";
import { GuestRoute } from "@/features/auth/components/guest-route";
import { ProtectedRoute } from "@/features/auth/components/protected-route";
import { LoginPage } from "@/features/auth/pages/login-page";
import { RegisterPage } from "@/features/auth/pages/register-page";
import { CreateCredentialPage } from "@/features/credentials/pages/create-credential-page";
import { CredentialsPage } from "@/features/credentials/pages/credentials-page";
import { EditCredentialPage } from "@/features/credentials/pages/edit-credential-page";
import { HomePage } from "@/pages/home-page";
import { NotFoundPage } from "@/pages/not-found-page";

export const router = createBrowserRouter([
  {
    element: <GuestRoute />,
    children: [
      {
        element: <AuthLayout />,
        children: [
          {
            path: "/login",
            element: <LoginPage />,
          },
          {
            path: "/register",
            element: <RegisterPage />,
          },
        ],
      },
    ],
  },
  {
    element: <RootLayout />,
    children: [
      {
        element: <ProtectedRoute />,
        children: [
          {
            index: true,
            element: <HomePage />,
          },
          {
            path: "credentials",
            element: <CredentialsPage />,
          },
          {
            path: "credentials/new",
            element: <CreateCredentialPage />,
          },
          {
            path: "credentials/:id/edit",
            element: <EditCredentialPage />,
          },
        ],
      },
      {
        path: "*",
        element: <NotFoundPage />,
      },
    ],
  },
]);
