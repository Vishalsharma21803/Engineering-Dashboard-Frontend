import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@/lib/api-client";
import { credentialKeys } from "./credential.keys";

/** One platform from the backend registry (GET /api/credentials/platforms). */
export interface PlatformField {
  name: string;
  label: string;
  type: "text" | "url" | "secret";
  required: boolean;
  placeholder?: string;
  hint?: string;
}

export interface PlatformDefinition {
  id: string;
  category: "integration" | "ai";
  label: string;
  description: string;
  fields: PlatformField[];
  helpUrl?: string;
  aiProvider?: "CLAUDE" | "OPENROUTER" | "OPENCODE";
}

export interface ConnectResult {
  kind: "credential" | "solidtime" | "ai";
  id: string;
  name: string;
  record: unknown;
}

export const platformKeys = { list: ["credentials", "platforms"] as const };

export async function listPlatforms() {
  return (await apiRequest<{ platforms: PlatformDefinition[] }>("/api/credentials/platforms")).platforms;
}

export async function connectPlatform(input: { platform: string; label?: string; fields: Record<string, string> }) {
  return apiRequest<ConnectResult>("/api/credentials/connect", { method: "POST", body: input });
}

/** The registry rarely changes while the app is open. */
export function usePlatforms() {
  return useQuery({ queryKey: platformKeys.list, queryFn: listPlatforms, staleTime: 10 * 60_000 });
}

/** Adds a credential for any platform; every list that could show it is refreshed. */
export function useConnectPlatform() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: connectPlatform,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: credentialKeys.all }),
        queryClient.invalidateQueries({ queryKey: ["solidtime"] }),
        queryClient.invalidateQueries({ queryKey: ["ai"] }),
      ]),
  });
}
