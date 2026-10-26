import { apiRequest } from "@/lib/api-client";
import type {
  BuildSummary,
  BuildTimeline,
  Capabilities,
  Dashboard,
  Deployments,
  PipelineSummary,
  ProjectOverview,
  ProjectSummary,
  PullRequestDetail,
  PullRequestSummary,
  RepositorySummary,
  MyWorkPage,
  TeamWorkPage,
  WorkItemDetail,
  WorkItemListFilters,
} from "../types/azure.types";

/** All Azure DevOps data comes from the backend; the browser never calls Azure. */

type Query = Record<string, string | number | boolean | undefined>;

function azurePath(credentialId: string, path: string, query: Query = {}): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== false) {
      search.set(key, value === true ? "1" : String(value));
    }
  }

  const suffix = search.size > 0 ? `?${search.toString()}` : "";
  return `/api/azure/${encodeURIComponent(credentialId)}${path}${suffix}`;
}

const segment = encodeURIComponent;

export interface ReadOptions {
  refresh?: boolean;
}

export async function getCapabilities(credentialId: string) {
  const response = await apiRequest<{ capabilities: Capabilities }>(
    azurePath(credentialId, "/capabilities")
  );
  return response.capabilities;
}

export async function getDashboard(
  credentialId: string,
  projectId: string | undefined,
  options: ReadOptions = {}
) {
  const response = await apiRequest<{ dashboard: Dashboard }>(
    azurePath(credentialId, "/dashboard", { projectId, refresh: options.refresh })
  );
  return response.dashboard;
}

export async function listProjects(credentialId: string) {
  return apiRequest<{ projects: ProjectSummary[]; truncated: boolean }>(
    azurePath(credentialId, "/projects")
  );
}

export async function getProjectOverview(credentialId: string, projectId: string) {
  const response = await apiRequest<{ project: ProjectOverview }>(
    azurePath(credentialId, `/projects/${segment(projectId)}`)
  );
  return response.project;
}

/** Every assignee's work items in one project (project overview). */
/** Every active pull request in one project (project overview). */
export async function listProjectPullRequests(credentialId: string, projectId: string) {
  const response = await apiRequest<{ pullRequests: PullRequestSummary[] }>(
    azurePath(credentialId, "/pull-requests", { projectId, role: "everyone" })
  );
  return response.pullRequests;
}

export async function getWorkItem(credentialId: string, projectId: string, workItemId: number) {
  const response = await apiRequest<{ workItem: WorkItemDetail }>(
    azurePath(credentialId, `/projects/${segment(projectId)}/work-items/${workItemId}`)
  );
  return response.workItem;
}

export async function getPullRequest(
  credentialId: string,
  projectId: string,
  repositoryId: string,
  pullRequestId: number
) {
  const response = await apiRequest<{ pullRequest: PullRequestDetail }>(
    azurePath(
      credentialId,
      `/projects/${segment(projectId)}/repos/${segment(repositoryId)}/pull-requests/${pullRequestId}`
    )
  );
  return response.pullRequest;
}

export async function listPipelines(credentialId: string, projectId: string) {
  const response = await apiRequest<{ pipelines: PipelineSummary[] }>(
    azurePath(credentialId, `/projects/${segment(projectId)}/pipelines`)
  );
  return response.pipelines;
}

export async function listPipelineRuns(credentialId: string, projectId: string, pipelineId: number) {
  const response = await apiRequest<{ runs: BuildSummary[] }>(
    azurePath(credentialId, `/projects/${segment(projectId)}/pipelines/${pipelineId}/runs`, { top: 10 })
  );
  return response.runs;
}

export async function getBuildTimeline(credentialId: string, projectId: string, buildId: number) {
  const response = await apiRequest<{ timeline: BuildTimeline }>(
    azurePath(credentialId, `/projects/${segment(projectId)}/builds/${buildId}/timeline`)
  );
  return response.timeline;
}

export async function getDeployments(credentialId: string, projectId: string) {
  const response = await apiRequest<{ deployments: Deployments }>(
    azurePath(credentialId, `/projects/${segment(projectId)}/deployments`)
  );
  return response.deployments;
}

export async function listRepositories(credentialId: string, projectId: string) {
  const response = await apiRequest<{ repositories: RepositorySummary[] }>(
    azurePath(credentialId, `/projects/${segment(projectId)}/repos`)
  );
  return response.repositories;
}


/** My work tickets: filtered and paged by the server. */
export async function getMyWorkPage(
  credentialId: string,
  input: { projectId: string | undefined; page: number; hidden: boolean; filters: WorkItemListFilters }
) {
  const { assignee: _assignee, ...filters } = input.filters;
  const response = await apiRequest<{ myWork: MyWorkPage }>(
    azurePath(credentialId, "/my-work", { projectId: input.projectId, page: input.page, hidden: input.hidden, ...nonEmpty(filters) })
  );
  return response.myWork;
}

/** Everyone's tickets in one project: filtered and paged by the server. */
export async function getTeamWorkPage(
  credentialId: string,
  projectId: string,
  input: { scope: "open" | "all"; page: number; filters: WorkItemListFilters }
) {
  const { sop: _sop, ...filters } = input.filters;
  const response = await apiRequest<{ teamWork: TeamWorkPage }>(
    azurePath(credentialId, `/projects/${segment(projectId)}/team-work-items`, { scope: input.scope, page: input.page, ...nonEmpty(filters) })
  );
  return response.teamWork;
}

function nonEmpty(values: Record<string, string>): Query {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value.trim() !== ""));
}
