import { ApiError } from "@/lib/api-client";
import type { RuleProblem } from "../types/sop.types";

export const RULES_CHANGED_MESSAGE =
  "These rules were changed elsewhere since you opened them. The list has been reloaded; please make your change again.";

/** A server problem in words. Line numbers point into Markdown the list never shows, and request paths are cut to the field name. */
export function problemText(problem: RuleProblem): string {
  if (/^line \d+$/.test(problem.field)) {
    return problem.message;
  }

  const field = problem.field.replace(/^edits\.\d+\.(card\.)?/, "");
  return field ? `${field}: ${problem.message}` : problem.message;
}

/** Why an edit from the rules list was not saved. */
export function ruleEditErrorText(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return "Could not save the change.";
  }

  if (error.status === 409) {
    return RULES_CHANGED_MESSAGE;
  }

  return error.errors.length > 0 ? error.errors.map(problemText).join(" · ") : error.message;
}
