export const azureKeys = {
  all: ["azure"] as const,
  capabilities: (credentialId: string) => ["azure", credentialId, "capabilities"] as const,
  dashboard: (credentialId: string, projectId: string | undefined) =>
    ["azure", credentialId, "dashboard", projectId ?? "all"] as const,
  projects: (credentialId: string) => ["azure", credentialId, "projects"] as const,
  project: (credentialId: string, projectId: string) =>
    ["azure", credentialId, "project", projectId] as const,
  projectWorkItems: (credentialId: string, projectId: string, state: string) =>
    ["azure", credentialId, "project-work-items", projectId, state] as const,
  projectPullRequests: (credentialId: string, projectId: string) =>
    ["azure", credentialId, "project-pull-requests", projectId] as const,
  workItem: (credentialId: string, projectId: string, workItemId: number) =>
    ["azure", credentialId, "work-item", projectId, workItemId] as const,
  pullRequest: (credentialId: string, repositoryId: string, pullRequestId: number) =>
    ["azure", credentialId, "pull-request", repositoryId, pullRequestId] as const,
  pipelines: (credentialId: string, projectId: string) =>
    ["azure", credentialId, "pipelines", projectId] as const,
  pipelineRuns: (credentialId: string, projectId: string, pipelineId: number) =>
    ["azure", credentialId, "pipeline-runs", projectId, pipelineId] as const,
  timeline: (credentialId: string, projectId: string, buildId: number) =>
    ["azure", credentialId, "timeline", projectId, buildId] as const,
  deployments: (credentialId: string, projectId: string) =>
    ["azure", credentialId, "deployments", projectId] as const,
  repositories: (credentialId: string, projectId: string) =>
    ["azure", credentialId, "repositories", projectId] as const,
};

export const triageKeys = {
  all: ["triage"] as const,
  list: (credentialId: string) => ["triage", credentialId] as const,
};

export const actionKeys = {
  all: ["actions"] as const,
  list: (status: string | undefined) => ["actions", "list", status ?? "all"] as const,
  audit: (actionId: string | undefined) => ["actions", "audit", actionId ?? "all"] as const,
};
