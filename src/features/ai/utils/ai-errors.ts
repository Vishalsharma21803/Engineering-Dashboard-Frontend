import { ApiError } from "@/lib/api-client";

const VALIDATION_REASONS: Record<string, string> = {
  AI_KEY_INVALID: "The provider rejected this key. Check it was copied correctly and hasn't been revoked.",
  AI_PERMISSION_DENIED: "This key isn't allowed to use the API. Check its permissions in the provider console.",
};

export function describeValidationFailure(reason: string): string {
  return VALIDATION_REASONS[reason] ?? "The provider could not validate this key.";
}

export function describeAiError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const field = error.errors[0]?.message;
    return field ?? error.message ?? fallback;
  }

  return error instanceof Error && error.message ? `${fallback} (${error.message})` : fallback;
}
