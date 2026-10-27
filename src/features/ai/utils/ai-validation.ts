import type { AiProvider, ValidateAiCredentialResponse } from "../types/ai.types";
import { describeValidationFailure } from "./ai-errors";

export type AiNotice = { tone: "success" | "error"; text: string };

/** What a key check found, in words (the same for a new key and a re-check). */
export function validationNotice(provider: AiProvider, result: ValidateAiCredentialResponse): AiNotice {
  if (!result.valid) {
    return { tone: "error", text: describeValidationFailure(result.reason) };
  }

  if (provider === "CLAUDE") {
    return { tone: "success", text: `Key works. Models available: ${String(result.details.modelsAvailable || "none of Cockpit's models")}.` };
  }

  if (provider === "OPENCODE") {
    const free =
      result.details.freeModelsUsable === true
        ? "Free models can be used from Cockpit."
        : result.details.freeModelsUsable === false
          ? "OpenCode allows its free models only inside the OpenCode app, so choose a paid OpenCode model (needs credit)."
          : "Could not tell whether free models work from Cockpit.";
    return { tone: "success", text: `Key works. ${free}` };
  }

  const limit = result.details.freeRequestsDailyLimit
    ? ` Free-model requests today: ${String(result.details.freeRequestsToday ?? 0)} of ${String(result.details.freeRequestsDailyLimit)}.`
    : "";
  return { tone: "success", text: `Key works.${limit}` };
}
