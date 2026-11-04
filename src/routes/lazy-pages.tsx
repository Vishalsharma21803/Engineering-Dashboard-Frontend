import { lazy } from "react";

/*
 * Pages load on first visit (one file per area), so the first paint does not wait for
 * the whole app. The layouts show a loader while a page loads; a file that fails to
 * load (usually after a deploy) reaches the page's error boundary, which offers Reload.
 */
export const LoginPage = lazy(() => import("@/features/auth/pages/login-page").then((m) => ({ default: m.LoginPage })));
export const RegisterPage = lazy(() => import("@/features/auth/pages/register-page").then((m) => ({ default: m.RegisterPage })));
export const AzureLayout = lazy(() => import("@/features/azure-devops/components/azure-layout").then((m) => ({ default: m.AzureLayout })));
export const ActionsPage = lazy(() => import("@/features/azure-devops/pages/actions-page").then((m) => ({ default: m.ActionsPage })));
export const AzureEntryPage = lazy(() => import("@/features/azure-devops/pages/azure-entry-page").then((m) => ({ default: m.AzureEntryPage })));
export const DashboardPage = lazy(() => import("@/features/azure-devops/pages/dashboard-page").then((m) => ({ default: m.DashboardPage })));
export const ProjectOverviewPage = lazy(() => import("@/features/azure-devops/pages/project-overview-page").then((m) => ({ default: m.ProjectOverviewPage })));
export const ProjectsPage = lazy(() => import("@/features/azure-devops/pages/projects-page").then((m) => ({ default: m.ProjectsPage })));
export const PullRequestDetailPage = lazy(() => import("@/features/azure-devops/pages/pull-request-detail-page").then((m) => ({ default: m.PullRequestDetailPage })));
export const WorkItemDetailPage = lazy(() => import("@/features/azure-devops/pages/work-item-detail-page").then((m) => ({ default: m.WorkItemDetailPage })));
export const SopRulesPage = lazy(() => import("@/features/sop/pages/sop-rules-page").then((m) => ({ default: m.SopRulesPage })));
export const TimeIndexPage = lazy(() => import("@/features/solidtime/pages/time-page").then((m) => ({ default: m.TimeIndexPage })));
export const TimePage = lazy(() => import("@/features/solidtime/pages/time-page").then((m) => ({ default: m.TimePage })));
export const CreateCredentialPage = lazy(() => import("@/features/credentials/pages/create-credential-page").then((m) => ({ default: m.CreateCredentialPage })));
export const CredentialsPage = lazy(() => import("@/features/credentials/pages/credentials-page").then((m) => ({ default: m.CredentialsPage })));
export const EditCredentialPage = lazy(() => import("@/features/credentials/pages/edit-credential-page").then((m) => ({ default: m.EditCredentialPage })));
export const HomePage = lazy(() => import("@/pages/home-page").then((m) => ({ default: m.HomePage })));
