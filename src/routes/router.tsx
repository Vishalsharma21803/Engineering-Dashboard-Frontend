import { createBrowserRouter } from "react-router-dom";

import { RootLayout } from "@/components/layout/root-layout";
import { RouteError } from "@/components/layout/route-error";
import { AuthLayout } from "@/features/auth/components/auth-layout";
import { GuestRoute } from "@/features/auth/components/guest-route";
import { ProtectedRoute } from "@/features/auth/components/protected-route";
import { NotFoundPage } from "@/pages/not-found-page";
import {
  ActionsPage,
  AzureEntryPage,
  AzureLayout,
  CreateCredentialPage,
  CredentialsPage,
  DashboardPage,
  EditCredentialPage,
  HomePage,
  LoginPage,
  ProjectOverviewPage,
  ProjectsPage,
  PullRequestDetailPage,
  RegisterPage,
  SopRulesPage,
  TimeIndexPage,
  TimePage,
  WorkItemDetailPage,
} from "./lazy-pages";

/*
 * Error boundaries: each layout has a pathless child route with an errorElement, so a
 * crashing page is replaced by RouteError while the layout (navigation, Relay header)
 * stays. The top-level errorElements catch crashes in the layouts themselves.
 */
export const router = createBrowserRouter([
  {
    element: <GuestRoute />,
    errorElement: <RouteError fullPage />,
    children: [
      {
        element: <AuthLayout />,
        children: [
          {
            errorElement: <RouteError />,
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
    ],
  },
  {
    element: <RootLayout />,
    errorElement: <RouteError fullPage />,
    children: [
      {
        errorElement: <RouteError />,
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
              {
                path: "azure",
                element: <AzureEntryPage />,
              },
              {
                path: "sop-rules",
                element: <SopRulesPage />,
              },
              {
                path: "time",
                element: <TimeIndexPage />,
              },
              {
                path: "time/:credentialId",
                element: <TimePage />,
              },
              {
                path: "azure/:credentialId",
                element: <AzureLayout />,
                children: [
                  {
                    errorElement: <RouteError />,
                    children: [
                      {
                        index: true,
                        element: <DashboardPage />,
                      },
                      {
                        path: "projects",
                        element: <ProjectsPage />,
                      },
                      {
                        path: "projects/:projectId",
                        element: <ProjectOverviewPage />,
                      },
                      {
                        path: "projects/:projectId/work-items/:workItemId",
                        element: <WorkItemDetailPage />,
                      },
                      {
                        path: "projects/:projectId/repos/:repositoryId/pull-requests/:pullRequestId",
                        element: <PullRequestDetailPage />,
                      },
                      {
                        path: "actions",
                        element: <ActionsPage embedded />,
                      },
                    ],
                  },
                ],
              },
              {
                path: "actions",
                element: <ActionsPage />,
              },
            ],
          },
          {
            path: "*",
            element: <NotFoundPage />,
          },
        ],
      },
    ],
  },
]);
