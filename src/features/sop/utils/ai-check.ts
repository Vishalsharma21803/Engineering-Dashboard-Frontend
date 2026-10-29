import { providerShortName } from "@/features/ai/utils/ai-display";
import type { ActionKind } from "@/features/azure-devops/types/action.types";
import type { AiCheck, AiFixTarget, AiRuleResult } from "../types/sop.types";

const REASONS: Record<string, string> = {
  AI_NOT_CONFIGURED: "Choose an AI provider and model on the Credentials page.",
  AI_KEY_REQUIRED: "Add an API key for your AI provider on the Credentials page.",
  DAILY_LIMIT_REACHED: "Your daily AI spend limit is reached. Checks resume tomorrow (UTC) or after you raise the limit.",
  DATA_COLLECTION_NOT_ACCEPTED: "This free model needs your consent to the data notice on the Credentials page.",
  AI_KEY_INVALID: "The AI provider rejected your API key.",
  AI_NO_CREDIT: "Your AI provider account has no credit left.",
  AI_RATE_LIMITED: "The AI provider is rate limiting; the check will retry automatically.",
  AI_MODEL_UNAVAILABLE: "Your chosen model is not available. Pick another on the Credentials page.",
  AI_PERMISSION_DENIED: "Your API key may not use this model.",
  AI_UPSTREAM_ERROR: "The AI provider could not be reached. It will be retried on the next refresh.",
  AI_REFUSED: "The model declined to check this ticket.",
  AI_BAD_OUTPUT: "The model's answer was unusable. It will be retried on the next refresh.",
  AI_FREE_TIER_BLOCKED:
    "OpenCode allows its free models only inside the OpenCode app (from other apps it always answers \"free usage limit reached\"). Choose a paid OpenCode model (needs credit or OpenCode Go), Claude, or OpenRouter on the Credentials page.",
  PROJECT_NOT_CONFIGURED: "This project is not set up for SOP checks, or you switched it off (SOP rules → Projects).",
  CREDENTIAL_NOT_FOUND: "The Azure DevOps connection was removed.",
};

export function describeAiCheckReason(reason: string | null): string {
  return (reason && REASONS[reason]) ?? "The AI check could not run.";
}


/** Why a queued check is waiting, and until when (local time). */
export function describeAiPause(check: AiCheck): string {
  const provider = providerShortName(check.provider, "The AI provider");
  const until = check.notBefore
    ? new Date(check.notBefore).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })
    : "later";
  return `Paused: ${provider} is rate limiting this model for your key (free models have daily quotas). It retries by itself at ${until}. Click “Try now” to try once more, or choose another model or provider on the Credentials page.`;
}

export const FIX_TARGET_LABELS: Record<AiFixTarget, string> = {
  comment: "Add comment",
  description: "Replace description",
  acceptance_criteria: "Replace acceptance criteria",
  title: "Rename title",
  category: "Set category",
  tags: "Add tags",
};

/** The current review's verdicts by rule, or nothing when it judged another revision of the ticket. */
export function currentVerdicts(check: AiCheck | undefined, rev: number): Map<string, AiRuleResult> {
  return check && check.ticketRev === rev ? new Map((check.results ?? []).map((result) => [result.ruleId, result])) : new Map();
}

const TEXT_FIELDS: Partial<Record<AiFixTarget, string>> = {
  description: "description",
  acceptance_criteria: "acceptanceCriteria",
  title: "title",
};

/** The approval-gated action that applies an AI fix. Nothing is written until it is approved. */
export function fixToAction(fix: NonNullable<AiRuleResult["fix"]>): { kind: ActionKind; params: Record<string, unknown> } {
  switch (fix.target) {
    case "comment":
      return { kind: "WORK_ITEM_COMMENT", params: { text: fix.text } };
    case "category":
      return { kind: "WORK_ITEM_SET_CATEGORY", params: { category: fix.text } };
    case "tags":
      return {
        kind: "WORK_ITEM_ADD_TAGS",
        params: {
          tags: fix.text
            .split(/[,;]/)
            .map((tag) => tag.trim())
            .filter(Boolean)
            .slice(0, 10),
        },
      };
    default:
      return { kind: "WORK_ITEM_EDIT_TEXT", params: { field: TEXT_FIELDS[fix.target], text: fix.text } };
  }
}
