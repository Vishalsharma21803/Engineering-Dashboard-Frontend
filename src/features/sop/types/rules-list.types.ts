import type { RuleProblem, RuleSeverity } from "./sop.types";

/** When a rule is checked, relative to the ticket's stage history (the rulebook's `when:`). */
export type RuleWhen =
  | "before-active"
  | "at-estimation"
  | "while-active"
  | "at-review"
  | "at-testing"
  | "at-qa"
  | "at-uat"
  | "at-done"
  | "always";

export type ItemKind = "story" | "task" | "bug" | "feature" | "epic" | "impediment";

/** One rule as the rules list shows and edits it (GET /api/sop/rules). */
export interface RuleListItem {
  id: string;
  title: string;
  checker: "code" | "ai";
  uses: string | null;
  params: Record<string, unknown> | null;
  appliesTo: string[];
  when: string;
  severity: RuleSeverity;
  /** Plain-English rule text. */
  rule: string;
  /** AI-only rules: what passes and what fails. */
  passesWhen: string | null;
  failsWhen: string | null;
  origin: "default" | "personal";
  /** A MY- rule the user wrote, not a change to a default rule. */
  custom: boolean;
  /** The built-in starter has this rule, so owners can restore its version. */
  inStarter: boolean;
  /** The default rule's level and settings, when the user changed them. */
  defaults: { severity: RuleSeverity; params: Record<string, unknown> | null } | null;
}

/** One property of a check's settings, as zod's JSON Schema writes it. */
export interface ParamSchemaProperty {
  type?: string;
  enum?: string[];
  items?: { type?: string; enum?: string[] };
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  default?: unknown;
  description?: string;
}

export interface ParamSchema {
  type?: string;
  properties?: Record<string, ParamSchemaProperty>;
  required?: string[];
}

/** A built-in check a rule can use. `aiReview`: what the AI review does for it on the ticket page. */
export interface CheckInfo {
  name: string;
  description: string;
  aiReview: "judge" | "draft" | null;
  params: ParamSchema;
}

export interface RulesList {
  defaultVersion: number;
  personalVersion: number;
  canEditDefaults: boolean;
  issues: RuleProblem[];
  /** Default rules with my changes, plus my MY- rules. */
  rules: RuleListItem[];
  /** The default rulebook only. */
  defaultRules: RuleListItem[];
  checks: CheckInfo[];
}

export interface NewRuleCard {
  id?: string;
  title: string;
  checker: "code" | "ai";
  uses?: string;
  params?: Record<string, unknown>;
  appliesTo: ItemKind[];
  when: RuleWhen;
  severity: RuleSeverity;
  rule: string;
  passesWhen?: string;
  failsWhen?: string;
}

export type RuleEdit =
  | { op: "set"; id: string; severity?: RuleSeverity; params?: Record<string, unknown> }
  | { op: "reset"; id: string }
  | { op: "remove"; id: string }
  | { op: "add"; card: NewRuleCard };

export interface RuleEditsInput {
  /** The version the edits were made on; the server refuses them if a newer one was saved. */
  baseVersion: number;
  edits: RuleEdit[];
  note?: string;
}
