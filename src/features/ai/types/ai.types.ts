export type AiProvider = "CLAUDE" | "OPENROUTER" | "OPENCODE";
export type AiEffort = "LOW" | "MEDIUM" | "HIGH";
export type ValidationStatus = "VALID" | "INVALID" | "ERROR";

export interface AiCredential {
  id: string;
  provider: AiProvider;
  label: string | null;
  /** Last 4 characters only; keys are never sent to the browser. */
  keyHint: string;
  lastValidatedAt: string | null;
  lastValidationStatus: ValidationStatus | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiModelOption {
  provider: AiProvider;
  id: string;
  label: string;
  description: string | null;
  free: boolean;
  inputPerMTok: number;
  outputPerMTok: number;
  cacheReadPerMTok: number | null;
  contextLength: number | null;
  efforts: AiEffort[];
  mayCollectData: boolean;
}

export interface AiPreference {
  provider: AiProvider | null;
  model: string | null;
  effort: AiEffort;
  dailyLimitUsd: number;
  dataCollectionAcceptedAt: string | null;
  updatedAt: string | null;
}

export interface UpdateAiPreferenceInput {
  provider: AiProvider | null;
  model: string | null;
  effort: AiEffort;
  dailyLimitUsd: number;
  acceptDataCollection: boolean;
}

export interface AiUsageSummary {
  todayUsd: number;
  monthUsd: number;
  callsToday: number;
  resetsAt: string;
}

export type ValidateAiCredentialResponse =
  | { valid: true; details: Record<string, string | number | boolean | null>; lastValidatedAt: string }
  | { valid: false; reason: string; lastValidatedAt: string };
