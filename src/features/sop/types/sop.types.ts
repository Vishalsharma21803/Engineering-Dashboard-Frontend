import type { AiProvider } from "@/features/ai/types/ai.types";
import type { ComplianceResult, IdentityRef } from "@/features/azure-devops/types/azure.types";

export type RuleChecker = "code" | "ai";
export type RuleSeverity = "fail" | "warn" | "off";

export interface RulebookContent {
  version: number;
  content: string;
  note?: string | null;
  createdBy?: string | null;
  createdAt: string | null;
}

export interface RulebookVersionInfo {
  version: number;
  note?: string | null;
  createdBy?: string | null;
  createdAt: string | null;
}

export interface CardSummary {
  id: string;
  title: string;
  checker: RuleChecker;
  uses: string | null;
  appliesTo: string[];
  when: string;
  severity: RuleSeverity;
  origin: "default" | "personal";
}

export interface ProjectSummary {
  project: string;
  stageSource: "state" | "board_column";
  stages: Record<string, string[]>;
}

export interface RulebookSummary {
  projects: ProjectSummary[];
  cards: CardSummary[];
  overrides: Array<{ id: string; severity: RuleSeverity | null; params: Record<string, unknown> | null }>;
}

export interface RuleProblem {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: RuleProblem[];
  summary: RulebookSummary;
}

export interface EffectiveRules extends Omit<RulebookSummary, "overrides"> {
  defaultVersion: number;
  personalVersion: number;
  issues: RuleProblem[];
}

export type RulebookScope = "default" | "personal";

export interface SopTestInput {
  projectId: string;
  workItemId: number;
  draft?: { scope: RulebookScope; content: string };
}

export interface SopTestResult {
  result: ComplianceResult | null;
  /** Problems in the draft; when present nothing was checked. */
  errors: RuleProblem[];
}

export type AiCheckStatus = "QUEUED" | "RUNNING" | "DONE" | "FAILED" | "SKIPPED";
export type AiFixTarget = "comment" | "description" | "acceptance_criteria" | "title" | "category" | "tags";

export interface AiRuleResult {
  ruleId: string;
  ruleTitle: string;
  severity: "high" | "medium";
  verdict: "pass" | "fail" | "unsure";
  reason: string;
  /** What to do, for the developer; never posted. Missing on checks made before this field existed. */
  advice?: string | null;
  /** Verified: each quote appears in the ticket. */
  quotes: string[];
  /** Final text to post after review; may contain [[fill in: …]] gaps the developer completes. */
  fix: { target: AiFixTarget; text: string } | null;
  /** What the verifier changed, if anything. */
  note: string | null;
}

export interface AiCheck {
  workItemId: number;
  status: AiCheckStatus;
  /** Kept while a re-check runs, so earlier verdicts stay visible. */
  results: AiRuleResult[] | null;
  errorReason: string | null;
  /** What the AI provider itself said about the failure or limit. */
  errorDetail: string | null;
  provider: AiProvider | null;
  model: string | null;
  costUsd: number | null;
  /** Set while the check waits out a provider rate limit. */
  notBefore: string | null;
  finishedAt: string | null;
  updatedAt: string;
}

export interface EnqueueAiResult {
  queued: number[];
  unchanged: number[];
  skipped: Array<{ workItemId: number; reason: string }>;
}

export interface SopReport {
  projectName: string;
  configured: boolean;
  defaultVersion: number;
  generatedAt: string;
  itemsChecked: number;
  itemsWithGaps: number;
  compliantShare: number | null;
  byRule: Array<{ ruleId: string; ruleTitle: string; severity: "high" | "medium"; failing: number; checked: number }>;
  byPerson: Array<{ assignee: IdentityRef | null; items: number; itemsWithGaps: number; gaps: number }>;
  items: Array<{
    workItemId: number;
    title: string;
    type: string;
    state: string;
    assignee: IdentityRef | null;
    violations: Array<{ ruleId: string; ruleTitle: string; severity: "high" | "medium" | "low"; message: string }>;
  }>;
}
