import type { RuleSeverity } from "../types/sop.types";

/** How each rule severity is named on screen: a failed "fail" rule is an SOP gap. */
export const SEVERITY_LABELS: Record<RuleSeverity, string> = {
  fail: "Gap",
  warn: "Warning",
  notice: "Notice",
  off: "Off",
};

const UPPERCASE_WORDS = new Set(["pr", "prs", "ai", "qa", "uat"]);

/** "estimate-present" → "Estimate present", "pr-linked" → "PR linked". */
export function checkerLabel(slug: string): string {
  const words = slug.split(/[-_\s]+/).filter(Boolean).map((word) => (UPPERCASE_WORDS.has(word.toLowerCase()) ? word.toUpperCase() : word.toLowerCase()));
  const sentence = words.join(" ");
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

/** "task" → "Task". */
export function itemTypeLabel(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

/** Which rule versions were used, in plain words: "Default rules v1 · no personal rules". -1 is an unsaved draft. */
export function rulebookVersionsLabel(defaultVersion: number, personalVersion: number): string {
  const base =
    defaultVersion === -1 ? "Default rules (unsaved draft)" : defaultVersion === 0 ? "Built-in default rules" : `Default rules v${defaultVersion}`;
  const personal =
    personalVersion === -1 ? "your rules (unsaved draft)" : personalVersion === 0 ? "no personal rules" : `your rules v${personalVersion}`;
  return `${base} · ${personal}`;
}
