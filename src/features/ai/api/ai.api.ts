import { apiRequest } from "@/lib/api-client";
import type {
  AiCredential,
  AiModelOption,
  AiPreference,
  AiProvider,
  AiUsageSummary,
  SopCheckTiming,
  UpdateAiPreferenceInput,
  ValidateAiCredentialResponse,
} from "../types/ai.types";

/** AI keys are write-only: the backend stores and uses them, the browser never gets them back. */

export async function listAiCredentials() {
  return (await apiRequest<{ credentials: AiCredential[] }>("/api/ai/credentials")).credentials;
}

export async function replaceAiKey(id: string, apiKey: string) {
  return (
    await apiRequest<{ credential: AiCredential }>(`/api/ai/credentials/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: { apiKey },
    })
  ).credential;
}

export async function deleteAiCredential(id: string): Promise<void> {
  await apiRequest(`/api/ai/credentials/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function validateAiCredential(id: string) {
  return apiRequest<ValidateAiCredentialResponse>(`/api/ai/credentials/${encodeURIComponent(id)}/validate`, {
    method: "POST",
  });
}

export async function listAiModels(provider: AiProvider) {
  return (await apiRequest<{ models: AiModelOption[] }>(`/api/ai/models?provider=${provider}`)).models;
}

export async function getAiPreference() {
  return (await apiRequest<{ preference: AiPreference }>("/api/ai/preferences")).preference;
}

export async function updateAiPreference(input: UpdateAiPreferenceInput) {
  return (await apiRequest<{ preference: AiPreference }>("/api/ai/preferences", { method: "PUT", body: input })).preference;
}

export async function getAiUsage() {
  return (await apiRequest<{ usage: AiUsageSummary }>("/api/ai/usage")).usage;
}

export async function getSopCheckTiming() {
  return (await apiRequest<{ timing: SopCheckTiming }>("/api/ai/sop-check-timing")).timing;
}

export async function getOpenRouterAllowlist() {
  return apiRequest<{ modelIds: string[]; models: AiModelOption[] }>("/api/ai/settings/openrouter-models");
}

export async function setOpenRouterAllowlist(modelIds: string[]) {
  return (
    await apiRequest<{ modelIds: string[] }>("/api/ai/settings/openrouter-models", {
      method: "PUT",
      body: { modelIds },
    })
  ).modelIds;
}
