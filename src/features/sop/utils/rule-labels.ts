import type { ItemKind, RuleWhen } from "../types/rules-list.types";
import type { RuleSeverity } from "../types/sop.types";

/** How each rule severity is named on screen: a failed "fail" rule is an SOP gap. */
export const SEVERITY_LABELS: Record<RuleSeverity, string> = {
  fail: "Gap",
  warn: "Warning",
  notice: "Notice",
  off: "Off",
};

/** Rule levels in the order they are offered, most serious first. */
export const SEVERITY_ORDER: RuleSeverity[] = ["fail", "warn", "notice", "off"];

/** Stages in the order a ticket meets them: the rules list is grouped this way. */
export const WHEN_ORDER: RuleWhen[] = [
  "before-active",
  "at-estimation",
  "while-active",
  "at-review",
  "at-testing",
  "at-qa",
  "at-uat",
  "at-done",
  "always",
];

export const WHEN_GROUP_LABELS: Record<RuleWhen, string> = {
  "before-active": "Before work starts",
  "at-estimation": "At estimation",
  "while-active": "While in progress",
  "at-review": "At review",
  "at-testing": "At testing",
  "at-qa": "At QA",
  "at-uat": "At UAT",
  "at-done": "At done",
  always: "Always",
};

/** What the AI review on the ticket page does for a built-in check (see the check catalog's `aiReview`). */
export const AI_REVIEW_NOTES: Record<"judge" | "draft", string> = {
  judge: "On the ticket page the AI review can clear this when it is written another way.",
  draft: "On the ticket page the AI review drafts the fix.",
};

export const ITEM_KINDS: ItemKind[] = ["story", "task", "bug", "feature", "epic", "impediment"];

const UPPERCASE_WORDS = new Set(["pr", "prs", "ai", "qa", "uat"]);

/** "estimate-present" → "Estimate present", "pr-linked" → "PR linked". */
export function checkerLabel(slug: string): string {
  const words = slug.split(/[-_\s]+/).filter(Boolean).map((word) => (UPPERCASE_WORDS.has(word.toLowerCase()) ? word.toUpperCase() : word.toLowerCase()));
  const sentence = words.join(" ");
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

/** A check setting's key in words: "within_hours" → "Within hours", "min_length" → "Min length". */
export function paramLabel(key: string): string {
  return checkerLabel(key);
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
