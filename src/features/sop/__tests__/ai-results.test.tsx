import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { AiReviewHeader, AiRuleReview } from "../components/ai-results";
import type { AiCheck, AiRuleResult } from "../types/sop.types";
import { currentVerdicts, fixToAction } from "../utils/ai-check";

const draft: AiRuleResult = {
  ruleId: "STR-08",
  ruleTitle: "Approach before starting",
  severity: "medium",
  review: "gap",
  verdict: "fail",
  reason: "No steps are written down.",
  advice: "State the steps.",
  quotes: [],
  fix: { target: "comment", text: "Approach:\n1. Add the export button" },
  note: null,
};

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
  ticketRev: 5,
  results: [draft],
};

function renderHeader(props: Partial<Parameters<typeof AiReviewHeader>[0]> = {}) {
  const onRecheck = vi.fn();
  render(
    <MemoryRouter>
      <AiReviewHeader configured check={check} rev={5} onRecheck={onRecheck} isRechecking={false} reviewable {...props} />
    </MemoryRouter>
  );
  return onRecheck;
}

describe("AiReviewHeader", () => {
  it("shows who reviewed the ticket and when, and reviews again on request", async () => {
    const onRecheck = renderHeader();
    expect(screen.getByText("AI review").closest("div")).toHaveTextContent(/claude-sonnet-5-5 · \$0\.0042 · checked/);
    await userEvent.click(screen.getByRole("button", { name: "Review again" }));
    expect(onRecheck).toHaveBeenCalled();
  });

  it("explains skipped reviews and points to setup when AI is not configured", () => {
    renderHeader({ check: { ...check, status: "SKIPPED", errorReason: "DAILY_LIMIT_REACHED", results: null } });
    expect(screen.getByRole("alert")).toHaveTextContent("daily AI spend limit");

    document.body.innerHTML = "";
    renderHeader({ configured: false });
    expect(screen.getByRole("link", { name: "Set up your AI model" })).toHaveAttribute("href", "/credentials");
  });

  it("shows a rate-limited review as paused with its retry time and the provider's words, and can try now", async () => {
    const retryAt = new Date(Date.now() + 10 * 60 * 60 * 1000).toISOString();
    const onRecheck = renderHeader({
      check: { ...check, status: "QUEUED", provider: "OPENROUTER", errorReason: "AI_RATE_LIMITED", errorDetail: "free-models-per-day limit exceeded", notBefore: retryAt },
    });

    expect(screen.getByRole("status")).toHaveTextContent("Paused: OpenRouter is rate limiting this model for your key");
    expect(screen.getByText("OpenRouter said: “free-models-per-day limit exceeded”")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try now" }));
    expect(onRecheck).toHaveBeenCalled();
  });

  it("lets a review paused by an old provider run now with the current one", async () => {
    const retryAt = new Date(Date.now() + 10 * 60 * 60 * 1000).toISOString();
    const onRecheck = renderHeader({
      currentProvider: "OPENCODE",
      check: { ...check, status: "QUEUED", provider: "OPENROUTER", errorReason: "AI_RATE_LIMITED", notBefore: retryAt },
    });

    expect(screen.getByRole("status")).toHaveTextContent("paused by OpenRouter. You now use OpenCode");
    await userEvent.click(screen.getByRole("button", { name: "Review with OpenCode" }));
    expect(onRecheck).toHaveBeenCalled();
  });

  it("says when a review is running, and hides a review of an older revision of the ticket", () => {
    renderHeader({ check: { ...check, status: "RUNNING" }, rev: 6 });
    expect(screen.getByRole("button", { name: "Reviewing…" })).toBeDisabled();
    expect(screen.getByText(/code results below are already final/)).toBeInTheDocument();
    expect(screen.getByText(/results are hidden until this review finishes/)).toBeInTheDocument();
    expect(currentVerdicts(check, 6).size).toBe(0);
    expect(currentVerdicts(check, 5).get("STR-08")).toBe(draft);
  });
});

describe("AiRuleReview drafts", () => {
  const failing = (text: string, advice: string | null = "State the benefit.") => ({ ...draft, advice, fix: { target: "comment" as const, text } });

  it("shows the suggestion apart from the draft, and proposes the edited text", async () => {
    const onUseFix = vi.fn();
    render(<AiRuleReview result={failing("Approach:\n1. Add the export button")} onUseFix={onUseFix} />);

    expect(screen.getByText("AI confirms")).toBeInTheDocument();
    expect(screen.getByText("Suggestion:").closest("p")).toHaveTextContent("Suggestion: State the benefit.");
    const text = screen.getByLabelText(/Ready to post · Add comment/);
    await userEvent.type(text, "\n2. Stream the CSV");
    await userEvent.click(screen.getByRole("button", { name: "Use this text…" }));

    expect(onUseFix).toHaveBeenCalledWith(expect.objectContaining({ ruleId: "STR-08" }), {
      target: "comment",
      text: "Approach:\n1. Add the export button\n2. Stream the CSV",
    });
  });

  it("blocks the draft until every [[fill in]] gap is completed", async () => {
    render(<AiRuleReview result={failing("Root cause: [[fill in: root cause]]. Fixed in [[fill in: PR number]].")} onUseFix={vi.fn()} />);

    const use = screen.getByRole("button", { name: "Use this text…" });
    expect(use).toBeDisabled();
    expect(screen.getByText(/Fill in these 2 gaps first/)).toBeInTheDocument();

    const text = screen.getByLabelText(/Ready to post/);
    await userEvent.clear(text);
    await userEvent.type(text, "Root cause: null document on save. Fixed in PR 42.");
    expect(use).toBeEnabled();
  });

  it("labels quality advice and plain-fact drafts, and shows old results without a suggestion line", () => {
    render(<AiRuleReview result={{ ...failing("Hello", null), review: "quality" }} />);
    expect(screen.getByText("AI suggestion")).toBeInTheDocument();
    expect(screen.queryByText("Suggestion:")).not.toBeInTheDocument();

    document.body.innerHTML = "";
    render(<AiRuleReview result={{ ...failing("As a manager…"), review: "draft" }} />);
    expect(screen.getByText("AI draft")).toBeInTheDocument();
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
