import { createBrowserRouter } from "react-router-dom";

import { RootLayout } from "@/components/layout/root-layout";
import { AuthLayout } from "@/features/auth/components/auth-layout";
import { GuestRoute } from "@/features/auth/components/guest-route";
import { ProtectedRoute } from "@/features/auth/components/protected-route";
import { LoginPage } from "@/features/auth/pages/login-page";
import { RegisterPage } from "@/features/auth/pages/register-page";
import { AzureLayout } from "@/features/azure-devops/components/azure-layout";
import { ActionsPage } from "@/features/azure-devops/pages/actions-page";
import { AzureEntryPage } from "@/features/azure-devops/pages/azure-entry-page";
import { DashboardPage } from "@/features/azure-devops/pages/dashboard-page";
import { ProjectOverviewPage } from "@/features/azure-devops/pages/project-overview-page";
import { ProjectsPage } from "@/features/azure-devops/pages/projects-page";
import { PullRequestDetailPage } from "@/features/azure-devops/pages/pull-request-detail-page";
import { WorkItemDetailPage } from "@/features/azure-devops/pages/work-item-detail-page";
import { SopRulesPage } from "@/features/sop/pages/sop-rules-page";
import { TimeIndexPage, TimePage } from "@/features/solidtime/pages/time-page";
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
]);
