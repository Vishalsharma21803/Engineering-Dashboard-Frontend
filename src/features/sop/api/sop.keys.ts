export const sopKeys = {
  all: ["sop"] as const,
  rulebook: (scope: string) => ["sop", "rulebook", scope] as const,
  versions: (scope: string) => ["sop", "versions", scope] as const,
  effective: ["sop", "effective"] as const,
  projects: ["sop", "projects"] as const,
  azureProjects: (credentialId: string) => ["sop", "projects", "azure", credentialId] as const,
  projectSuggestion: (credentialId: string, projectId: string) => ["sop", "projects", "suggestion", credentialId, projectId] as const,
  projectHistory: (projectName: string) => ["sop", "projects", "history", projectName] as const,
  ai: (credentialId: string) => ["sop", "ai", credentialId] as const,
  reportRuns: (credentialId: string, projectId: string) => ["sop", "report", credentialId, projectId, "runs"] as const,
  reportRun: (credentialId: string, projectId: string, runId: string) => ["sop", "report", credentialId, projectId, "run", runId] as const,
  aiResults: (credentialId: string, ids: string) => ["sop", "ai", credentialId, ids] as const,
};
