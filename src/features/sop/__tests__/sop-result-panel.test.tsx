import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ComplianceResult, ComplianceViolation } from "@/features/azure-devops/types/azure.types";
import { renderWithProviders } from "@/test/render";
import { SopResultPanel } from "../components/sop-result-panel";
import type { AiCheck } from "../types/sop.types";

const finding = (ruleId: string, ruleTitle: string, extra: Partial<ComplianceViolation> = {}): ComplianceViolation => ({
  ruleId,
  ruleTitle,
  checker: "code",
  severity: "medium",
  message: `${ruleTitle} is missing.`,
  evidence: [],
  suggestedAction: null,
  phase: "now",
  ...extra,
});

const result: ComplianceResult = {
  workItemId: 7,
  projectName: "Alpha",
  title: "Export",
  type: "Task",
  state: "Review",
  stateCategory: "InProgress",
  configured: true,
  sopProject: "checked",
  rulebook: { defaultVersion: 2, personalVersion: 0 },
  violations: [finding("STR-08", "Approach", { phase: "earlier" })],
  notices: [finding("STR-11", "Tags are set", { severity: "low", message: "No tags.", phase: "earlier" })],
  todos: [finding("PR-05", "Moving-to-review comment")],
  passedRules: [{ ruleId: "STR-03", ruleTitle: "Priority is set" }],
  skippedRules: [],
  aiRules: [],
  cleared: [{ ruleId: "STR-15", ruleTitle: "Definition of Done", reason: "The AC say they are the DoD.", quotes: ["AC are our DoD"] }],
  aiReview: { status: "DONE", checkedAt: new Date().toISOString(), outdated: false },
};

const check: AiCheck = {
  workItemId: 7,
  status: "DONE",
  provider: "CLAUDE",
  model: "claude-sonnet-5-5",
  costUsd: 0,
  notBefore: null,
  errorDetail: null,
  finishedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  errorReason: null,
  ticketRev: 5,
  results: [
    { ruleId: "STR-08", ruleTitle: "Approach", severity: "medium", review: "gap", verdict: "fail", reason: "Only one vague line.", advice: "List the steps.", quotes: [], fix: { target: "comment", text: "Approach:\n1. a\n2. b\n3. c" }, note: null },
    { ruleId: "STR-09", ruleTitle: "TL approval", severity: "low", review: "quality", verdict: "fail", reason: "The approval is conditional.", advice: "Ask for a clear approval.", quotes: [], fix: null, note: null },
  ],
};

const ai = { configured: true, check, rev: 5, onRecheck: vi.fn(), isRechecking: false };

describe("SopResultPanel", () => {
  it("separates what this stage needs from gaps missed earlier, notices and AI clears", () => {
    renderWithProviders(<SopResultPanel result={result} />);

    const now = screen.getByRole("heading", { name: "Needed now" }).closest("section") as HTMLElement;
    expect(within(now).getByText("Moving-to-review comment")).toBeInTheDocument();
    expect(within(now).getByText("to do")).toBeInTheDocument();

    const earlier = screen.getByRole("heading", { name: "Gaps from earlier stages" }).closest("section") as HTMLElement;
    expect(within(earlier).getByText("Approach")).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "Notices (not counted as gaps)" })).toBeInTheDocument();
    const cleared = screen.getByRole("heading", { name: "Cleared by AI" }).closest("section") as HTMLElement;
    expect(within(cleared).getByText("The AC say they are the DoD.")).toBeInTheDocument();
    expect(within(cleared).getByText("“AC are our DoD”")).toBeInTheDocument();
  });

  it("says when nothing is needed in this stage", () => {
    renderWithProviders(<SopResultPanel result={{ ...result, violations: [], todos: [] }} />);
    expect(screen.getByText("Nothing needed in this stage.")).toBeInTheDocument();
  });

  it("puts the AI review on its gap and lists advice on passed rules separately", () => {
    renderWithProviders(<SopResultPanel result={result} ai={ai} />);

    const earlier = screen.getByRole("heading", { name: "Gaps from earlier stages" }).closest("section") as HTMLElement;
    expect(within(earlier).getByText("AI confirms")).toBeInTheDocument();
    expect(within(earlier).getByLabelText(/Ready to post · Add comment/)).toHaveValue("Approach:\n1. a\n2. b\n3. c");

    const more = screen.getByRole("heading", { name: "More from the AI review" }).closest("section") as HTMLElement;
    expect(within(more).getByText("The approval is conditional.")).toBeInTheDocument();
  });

  it("does not show a review of an older revision of the ticket", () => {
    renderWithProviders(<SopResultPanel result={result} ai={{ ...ai, rev: 6 }} />);
    expect(screen.queryByText("AI confirms")).not.toBeInTheDocument();
    expect(screen.getByText(/The ticket changed since the last review/)).toBeInTheDocument();
  });

  it("shows an AI-only rule's advice and draft on its finding", () => {
    const aiOnly = { ...result, violations: [finding("MY-01", "Browser named", { checker: "ai", message: "No browser." })], todos: [], notices: [], cleared: [] };
    const review = { ruleId: "MY-01", ruleTitle: "Browser named", severity: "medium" as const, review: "ai-rule" as const, verdict: "fail" as const, reason: "No browser.", advice: "Name it.", quotes: [], fix: { target: "comment" as const, text: "Found in Chrome 120." }, note: null };
    renderWithProviders(<SopResultPanel result={aiOnly} ai={{ ...ai, check: { ...check, results: [review] } }} />);

    expect(screen.getAllByText("No browser.")).toHaveLength(1);
    expect(screen.getByText("Suggestion:").closest("p")).toHaveTextContent("Name it.");
    expect(screen.getByLabelText(/Ready to post · Add comment/)).toHaveValue("Found in Chrome 120.");
  });
});
