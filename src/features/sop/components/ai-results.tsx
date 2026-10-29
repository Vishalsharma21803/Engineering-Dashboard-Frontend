import { useState } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { providerShortName } from "@/features/ai/utils/ai-display";
import { StatusBadge } from "@/features/azure-devops/components/status-badge";
import { formatRelative } from "@/features/azure-devops/utils/format";
import { SEVERITY_TONES } from "@/features/azure-devops/utils/labels";
import { ApiError } from "@/lib/api-client";
import { isAiCheckBusy, isAiCheckPaused } from "../hooks/use-sop-ai";
import type { AiCheck, AiRuleResult } from "../types/sop.types";
import { FIX_TARGET_LABELS, describeAiCheckReason, describeAiPause } from "../utils/ai-check";

export interface AiReviewProps {
  configured: boolean;
  check: AiCheck | undefined;
  /** The ticket's current revision: a review of another revision may be outdated. */
  rev: number;
  onRecheck: () => void;
  isRechecking: boolean;
  /** Provider reviews use now; a review paused by another provider can run right away. */
  currentProvider?: string | null;
  /** Asking the server to (re)check failed, e.g. offline or AI settings missing. */
  enqueueError?: unknown;
  /** Proposes the (edited) draft through the approval flow; without it drafts are read-only. */
  onUseFix?: (result: AiRuleResult, fix: NonNullable<AiRuleResult["fix"]>) => void;
  isProposing?: boolean;
}

/** A gap the AI left for facts only the developer knows. */
const PLACEHOLDER = /\[\[\s*fill in[^\]]*\]\]/gi;

function placeholders(text: string): string[] {
  return text.match(PLACEHOLDER) ?? [];
}

function FixDraft({ result, fix, onUseFix, isProposing }: { result: AiRuleResult; fix: NonNullable<AiRuleResult["fix"]>; onUseFix: AiReviewProps["onUseFix"]; isProposing: boolean }) {
  const [text, setText] = useState(fix.text);
  const gaps = placeholders(text);
  const singleLine = fix.target === "title" || fix.target === "category" || fix.target === "tags";
  const id = `ai-fix-${result.ruleId}`;

  return (
    <div className="flex flex-col gap-1.5 rounded-md bg-slate-50 p-2">
      <label htmlFor={id} className="text-xs font-medium text-slate-600">
        Ready to post · {FIX_TARGET_LABELS[fix.target]} (edit before using it)
      </label>
      <textarea
        id={id}
        value={text}
        rows={singleLine ? 1 : Math.min(12, Math.max(3, text.split("\n").length + 1))}
        onChange={(event) => setText(singleLine ? event.target.value.replace(/\n/g, " ") : event.target.value)}
        className="w-full resize-y rounded-md border border-slate-300 bg-surface px-2 py-1.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
      />
      {gaps.length > 0 ? (
        <p className="text-xs text-amber-700">
          Fill in {gaps.length === 1 ? "this gap" : `these ${gaps.length} gaps`} first: {gaps.join(", ")}
        </p>
      ) : null}
      {onUseFix ? (
        <div>
          <Button
            size="sm"
            disabled={isProposing || gaps.length > 0 || text.trim() === ""}
            onClick={() => onUseFix(result, { target: fix.target, text: text.trim() })}
          >
            Use this text…
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** How the AI's verdict reads for a rule (see AiRuleResult.review). */
function verdictLabel(result: AiRuleResult): { label: string; tone: "danger" | "warning" | "info" | "success" | "neutral" } {
  if (result.verdict === "unsure") {
    return { label: "AI unsure", tone: "neutral" };
  }

  switch (result.review) {
    case "gap":
      return result.verdict === "pass" ? { label: "AI: met", tone: "success" } : { label: "AI confirms", tone: "warning" };
    case "quality":
      return result.verdict === "pass" ? { label: "AI: good", tone: "success" } : { label: "AI suggestion", tone: "info" };
    case "draft":
      return { label: "AI draft", tone: "info" };
    default:
      return result.verdict === "pass" ? { label: "Passed", tone: "success" } : { label: result.severity === "low" ? "Notice" : "Failed", tone: SEVERITY_TONES[result.severity] };
  }
}

/** One rule's AI review: its verdict, reason, verified quotes, advice and a draft to propose. */
export function AiRuleReview({ result, onUseFix, isProposing = false, showRule = false }: { result: AiRuleResult; onUseFix?: AiReviewProps["onUseFix"]; isProposing?: boolean; showRule?: boolean }) {
  const { label, tone } = verdictLabel(result);

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-dashed border-slate-200 p-2">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={tone}>{label}</StatusBadge>
        {showRule ? (
          <>
            <span className="font-mono text-xs text-slate-500">{result.ruleId}</span>
            <span className="text-sm font-medium text-slate-900">{result.ruleTitle}</span>
          </>
        ) : null}
      </div>
      <p className="text-sm text-slate-700">{result.reason}</p>
      {result.quotes.length > 0 ? (
        <ul className="space-y-1">
          {result.quotes.map((quote, index) => (
            <li key={`${index}:${quote}`} className="border-l-2 border-slate-300 pl-2 text-xs italic text-slate-600">
              “{quote}”
            </li>
          ))}
        </ul>
      ) : null}
      {result.advice ? (
        <p className="text-sm text-slate-700">
          <span className="font-medium">Suggestion:</span> {result.advice}
        </p>
      ) : null}
      {result.fix ? <FixDraft result={result} fix={result.fix} onUseFix={onUseFix} isProposing={isProposing} /> : null}
      {result.note ? <p className="text-xs text-slate-500">Checked: {result.note}</p> : null}
    </div>
  );
}

/**
 * The AI review's status for one ticket: who reviewed it and when, whether it
 * is running, paused or failed, and a button to review again.
 */
export function AiReviewHeader({ configured, check, rev, onRecheck, isRechecking, currentProvider = null, enqueueError = null, reviewable }: AiReviewProps & { reviewable: boolean }) {
  if (!configured) {
    return reviewable ? (
      <p className="text-sm text-slate-600">
        An AI review can clear findings written another way and draft fixes.{" "}
        <Link to="/credentials" className="font-medium text-indigo-700 hover:underline">
          Set up your AI model
        </Link>{" "}
        to use it.
      </p>
    ) : null;
  }

  const busy = isAiCheckBusy(check);
  // Paused by a provider the user no longer uses: it can run now with the current one.
  const pausedByOther = isAiCheckPaused(check) && Boolean(currentProvider) && check?.provider !== currentProvider;
  const paused = isAiCheckPaused(check) && !pausedByOther;
  const providerName = providerShortName(currentProvider, "AI");
  const outdated = Boolean(check?.results?.length) && check?.ticketRev !== rev;

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-slate-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900">AI review</p>
          <p className="break-all text-xs text-slate-500">
            {busy
              ? "Reviewing this ticket… the code results below are already final."
              : check?.status === "DONE"
                ? [check.model, check.costUsd ? `$${check.costUsd.toFixed(4)}` : null, check.finishedAt ? `checked ${formatRelative(check.finishedAt)}` : null]
                    .filter(Boolean)
                    .join(" · ")
                : !check
                  ? "Not reviewed yet."
                  : null}
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={onRecheck} disabled={busy || isRechecking}>
          {busy || isRechecking ? <Spinner className="size-4" /> : null}
          {busy ? "Reviewing…" : paused ? "Try now" : pausedByOther ? `Review with ${providerName}` : "Review again"}
        </Button>
      </div>

      {enqueueError ? (
        <p role="alert" className="text-sm text-rose-600">
          Could not start the AI review: {enqueueError instanceof ApiError ? enqueueError.message : "the server could not be reached"}.
        </p>
      ) : null}
      {check && (check.status === "FAILED" || check.status === "SKIPPED") ? (
        <p role="alert" className="text-sm text-amber-700">
          {describeAiCheckReason(check.errorReason)}
        </p>
      ) : null}
      {pausedByOther && check ? (
        <p role="status" className="text-sm text-slate-600">
          The last review was paused by {providerShortName(check.provider, "another provider")}. You now use {providerName}; it is
          reviewed again automatically, or click “Review with {providerName}”.
        </p>
      ) : null}
      {paused && check ? (
        <p role="status" className="text-sm text-amber-700">
          {describeAiPause(check)}
        </p>
      ) : null}
      {check?.errorDetail && (paused || check.status === "FAILED" || check.status === "SKIPPED") ? (
        <p className="text-xs text-slate-500">
          {providerShortName(check.provider, "The provider")} said: “{check.errorDetail}”
        </p>
      ) : null}
      {outdated ? (
        <p className="text-xs text-slate-500">The ticket changed since the last review, so its results are hidden{busy ? " until this review finishes" : "; it may be outdated"}.</p>
      ) : null}
    </div>
  );
}
