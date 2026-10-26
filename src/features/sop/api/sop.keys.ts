export const sopKeys = {
  all: ["sop"] as const,
  rulebook: (scope: string) => ["sop", "rulebook", scope] as const,
  versions: (scope: string) => ["sop", "versions", scope] as const,
  effective: ["sop", "effective"] as const,
  ai: (credentialId: string) => ["sop", "ai", credentialId] as const,
  report: (credentialId: string, projectId: string) => ["sop", "report", credentialId, projectId] as const,
  aiResults: (credentialId: string, ids: string) => ["sop", "ai", credentialId, ids] as const,
};
