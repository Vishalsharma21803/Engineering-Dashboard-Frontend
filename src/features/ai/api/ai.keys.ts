export const aiKeys = {
  all: ["ai"] as const,
  credentials: ["ai", "credentials"] as const,
  models: (provider: string) => ["ai", "models", provider] as const,
  preference: ["ai", "preference"] as const,
  usage: ["ai", "usage"] as const,
  timing: ["ai", "sop-check-timing"] as const,
  allowlist: ["ai", "openrouter-allowlist"] as const,
};
