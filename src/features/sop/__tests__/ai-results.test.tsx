import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import type { ComplianceResult } from "@/features/azure-devops/types/azure.types";
import { AiResults } from "../components/ai-results";
import type { AiCheck } from "../types/sop.types";
import { fixToAction, withAiViolations } from "../utils/ai-check";

const check: AiCheck = {
  workItemId: 7,
  status: "DONE",
  provider: "CLAUDE",
  model: "claude-sonnet-5-5",
  costUsd: 0.0042,
  notBefore: null,
  errorDetail: null,
  finishedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  errorReason: null,
  results: [
    {
      ruleId: "STR-08",
      ruleTitle: "Approach before starting",
      severity: "medium",
      verdict: "pass",
      reason: "Steps are listed.",
      quotes: [],
      fix: null,
      note: null,
    },
    {
      ruleId: "STR-06",
      ruleTitle: "User-story form",
      severity: "high",
      verdict: "fail",
      reason: "No benefit is stated.",
      quotes: ["As a manager I want a summary"],
      fix: { target: "description", text: "As a manager I want a summary so that I can track progress." },
      note: "1 quote(s) could not be found in the ticket and were removed.",
    },
  ],
};

function renderResults(props: Partial<Parameters<typeof AiResults>[0]> = {}) {
  const onRecheck = vi.fn();
  render(
    <MemoryRouter>
      <AiResults configured check={check} ruleCount={2} onRecheck={onRecheck} isRechecking={false} {...props} />
    </MemoryRouter>
  );
  return onRecheck;
}

describe("AiResults", () => {
  it("lists failures first with verified quotes, the fix and the verifier's note", async () => {
    const onRecheck = renderResults();

    const items = screen.getAllByRole("listitem").filter((item) => item.querySelector("span"));
    expect(items[0]).toHaveTextContent("STR-06");
    expect(screen.getByText("“As a manager I want a summary”")).toBeInTheDocument();
    expect(screen.getByLabelText("Ready to post · Replace description (edit before using it)")).toHaveValue(
      "As a manager I want a summary so that I can track progress."
    );
    expect(screen.getByText(/Checked: 1 quote\(s\) could not be found/)).toBeInTheDocument();
    expect(screen.getByText("AI checks").closest("p")).toHaveTextContent(/claude-sonnet-5-5 · \$0\.0042/);

    await userEvent.click(screen.getByRole("button", { name: "Re-check with AI" }));
    expect(onRecheck).toHaveBeenCalled();
  });

  it("explains skipped checks and points to setup when AI is not configured", () => {
    renderResults({ check: { ...check, status: "SKIPPED", errorReason: "DAILY_LIMIT_REACHED", results: null } });
    expect(screen.getByRole("alert")).toHaveTextContent("daily AI spend limit");

    document.body.innerHTML = "";
    renderResults({ configured: false });
    expect(screen.getByRole("link", { name: "Set up your AI model" })).toHaveAttribute("href", "/credentials");
  });

  it("shows a rate-limited check as paused with its retry time and the provider's words, and can try now", async () => {
    const retryAt = new Date(Date.now() + 10 * 60 * 60 * 1000).toISOString();
    const onRecheck = renderResults({
      check: { ...check, status: "QUEUED", provider: "OPENROUTER", errorReason: "AI_RATE_LIMITED", errorDetail: "free-models-per-day limit exceeded", notBefore: retryAt },
    });

    expect(screen.getByRole("status")).toHaveTextContent("Paused: OpenRouter is rate limiting this model for your key");
    expect(screen.getByText("OpenRouter said: “free-models-per-day limit exceeded”")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try now" }));
    expect(onRecheck).toHaveBeenCalled();
  });

  it("lets a check paused by an old provider run now with the current one", async () => {
    const retryAt = new Date(Date.now() + 10 * 60 * 60 * 1000).toISOString();
    const onRecheck = renderResults({
      currentProvider: "OPENCODE",
      check: { ...check, status: "QUEUED", provider: "OPENROUTER", errorReason: "AI_RATE_LIMITED", notBefore: retryAt },
    });

    expect(screen.getByRole("status")).toHaveTextContent("paused by OpenRouter. You now use OpenCode");
    await userEvent.click(screen.getByRole("button", { name: "Check with OpenCode" }));
    expect(onRecheck).toHaveBeenCalled();
  });

  it("shows a running check", () => {
    renderResults({ check: { ...check, status: "RUNNING" } });
    expect(screen.getByRole("button", { name: "Checking…" })).toBeDisabled();
    expect(screen.getByText("Showing the previous result until the new check finishes.")).toBeInTheDocument();
  });
});

describe("AiResults drafts", () => {
  const failing = (text: string, advice: string | null = "State the benefit.") => ({
    ...check,
    results: [
      {
        ruleId: "STR-06",
        ruleTitle: "User-story form",
        severity: "high" as const,
        verdict: "fail" as const,
        reason: "No benefit is stated.",
        advice,
        quotes: [],
        fix: { target: "comment" as const, text },
        note: null,
      },
    ],
  });

  it("shows the suggestion apart from the draft, and proposes the edited text", async () => {
    const onUseFix = vi.fn();
    renderResults({ check: failing("Approach:\n1. Add the export button"), onUseFix });

    expect(screen.getByText("Suggestion:").closest("p")).toHaveTextContent("Suggestion: State the benefit.");
    const draft = screen.getByLabelText(/Ready to post · Add comment/);
    await userEvent.type(draft, "\n2. Stream the CSV");
    await userEvent.click(screen.getByRole("button", { name: "Use this text…" }));

    expect(onUseFix).toHaveBeenCalledWith(expect.objectContaining({ ruleId: "STR-06" }), {
      target: "comment",
      text: "Approach:\n1. Add the export button\n2. Stream the CSV",
    });
  });

  it("blocks the draft until every [[fill in]] gap is completed", async () => {
    const onUseFix = vi.fn();
    renderResults({ check: failing("Root cause: [[fill in: root cause]]. Fixed in [[fill in: PR number]]."), onUseFix });

    const use = screen.getByRole("button", { name: "Use this text…" });
    expect(use).toBeDisabled();
    expect(screen.getByText(/Fill in these 2 gaps first/)).toBeInTheDocument();

    const draft = screen.getByLabelText(/Ready to post/);
    await userEvent.clear(draft);
    await userEvent.type(draft, "Root cause: null document on save. Fixed in PR 42.");
    expect(use).toBeEnabled();
  });

  it("shows checks made before advice existed without a suggestion line", () => {
    renderResults({ check: failing("Hello", null) });
    expect(screen.queryByText("Suggestion:")).not.toBeInTheDocument();
  });
});

describe("withAiViolations", () => {
  it("adds AI failures to the code results as violations", () => {
    const result = { workItemId: 7, violations: [{ ruleId: "STR-05" }], notices: [] } as unknown as ComplianceResult;
    const merged = withAiViolations(new Map([[7, result]]), new Map([[7, check]]));

    expect(merged.get(7)?.violations).toEqual([
      { ruleId: "STR-05" },
      expect.objectContaining({ ruleId: "STR-06", checker: "ai", severity: "high", message: "No benefit is stated.", evidence: ["As a manager I want a summary"] }),
    ]);
  });

  it("adds AI failures of notice rules as notices, not gaps", () => {
    const result = { workItemId: 7, violations: [], notices: [] } as unknown as ComplianceResult;
    const notice = { ...check, results: (check.results ?? []).map((item) => ({ ...item, severity: "low" as const })) };
    const merged = withAiViolations(new Map([[7, result]]), new Map([[7, notice]]));

    expect(merged.get(7)?.violations).toEqual([]);
    expect(merged.get(7)?.notices).toEqual([expect.objectContaining({ ruleId: "STR-06", checker: "ai", severity: "low" })]);
  });
});

describe("fixToAction", () => {
  it("maps each fix to an approval-gated action", () => {
    expect(fixToAction({ target: "comment", text: "Hi" })).toEqual({ kind: "WORK_ITEM_COMMENT", params: { text: "Hi" } });
    expect(fixToAction({ target: "acceptance_criteria", text: "1. Works" })).toEqual({ kind: "WORK_ITEM_EDIT_TEXT", params: { field: "acceptanceCriteria", text: "1. Works" } });
    expect(fixToAction({ target: "title", text: "[Blocked] Login" })).toEqual({ kind: "WORK_ITEM_EDIT_TEXT", params: { field: "title", text: "[Blocked] Login" } });
    expect(fixToAction({ target: "category", text: "Testing" })).toEqual({ kind: "WORK_ITEM_SET_CATEGORY", params: { category: "Testing" } });
    expect(fixToAction({ target: "tags", text: "backend, api;  login" })).toEqual({ kind: "WORK_ITEM_ADD_TAGS", params: { tags: ["backend", "api", "login"] } });
  });
});
