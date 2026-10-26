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

export interface AiResultsProps {
  configured: boolean;
  check: AiCheck | undefined;
  /** AI rules that apply to this ticket (from the code check). */
  ruleCount: number;
  onRecheck: () => void;
  isRechecking: boolean;
  /** Provider checks use now; a check paused by another provider can run right away. */
  currentProvider?: string | null;
  /** Asking the server to (re)check failed, e.g. offline or AI settings missing. */
  enqueueError?: unknown;
  /** Proposes the (edited) draft through the approval flow; without it drafts are read-only. */
  onUseFix?: (result: AiRuleResult, fix: NonNullable<AiRuleResult["fix"]>) => void;
  isProposing?: boolean;
}

const VERDICT_ORDER = { fail: 0, unsure: 1, pass: 2 } as const;

/** A gap the AI left for facts only the developer knows. */
const PLACEHOLDER = /\[\[\s*fill in[^\]]*\]\]/gi;

function placeholders(text: string): string[] {
  return text.match(PLACEHOLDER) ?? [];
}

function FixDraft({ result, fix, onUseFix, isProposing }: { result: AiRuleResult; fix: NonNullable<AiRuleResult["fix"]>; onUseFix: AiResultsProps["onUseFix"]; isProposing: boolean }) {
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
        className="w-full resize-y rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
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

function Verdict({ result, onUseFix, isProposing }: { result: AiRuleResult; onUseFix: AiResultsProps["onUseFix"]; isProposing: boolean }) {
  const tone = result.verdict === "fail" ? SEVERITY_TONES[result.severity] : result.verdict === "unsure" ? "warning" : "success";

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={tone}>{result.ruleId}</StatusBadge>
        <span className="text-sm font-medium text-slate-900">{result.ruleTitle}</span>
        <span className="text-xs uppercase tracking-wide text-slate-500">
          {result.verdict === "fail" && result.severity === "low" ? "notice" : result.verdict}
        </span>
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
    </li>
  );
}

/** AI verdicts for one ticket, with their verified quotes and suggested fixes. */
export function AiResults({
  configured,
  check,
  ruleCount,
  onRecheck,
  isRechecking,
  onUseFix,
  isProposing = false,
  currentProvider = null,
  enqueueError = null,
}: AiResultsProps) {
  if (ruleCount === 0) {
    return null;
  }

  if (!configured) {
    return (
      <p className="text-sm text-slate-600">
        {ruleCount} rule(s) here are judged by AI.{" "}
        <Link to="/credentials" className="font-medium text-indigo-700 hover:underline">
          Set up your AI model
        </Link>{" "}
        to check them.
      </p>
    );
  }

  const busy = isAiCheckBusy(check);
  // Paused by a provider the user no longer uses: it can run now with the current one.
  const pausedByOther = isAiCheckPaused(check) && Boolean(currentProvider) && check?.provider !== currentProvider;
  const paused = isAiCheckPaused(check) && !pausedByOther;
  const providerName = providerShortName(currentProvider, "AI");
  const results = [...(check?.results ?? [])].sort((a, b) => VERDICT_ORDER[a.verdict] - VERDICT_ORDER[b.verdict]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-900">
          AI checks
          {check?.model ? <span className="font-normal text-slate-500"> · {check.model}</span> : null}
          {check?.costUsd ? <span className="font-normal text-slate-500"> · ${check.costUsd.toFixed(4)}</span> : null}
          {check?.finishedAt ? <span className="font-normal text-slate-500"> · {formatRelative(check.finishedAt)}</span> : null}
        </p>
        <Button size="sm" variant="secondary" onClick={onRecheck} disabled={busy || isRechecking}>
          {busy || isRechecking ? <Spinner className="size-4" /> : null}
          {busy ? "Checking…" : paused ? "Try now" : pausedByOther ? `Check with ${providerName}` : "Re-check with AI"}
        </Button>
      </div>

      {enqueueError ? (
        <p role="alert" className="text-sm text-rose-600">
          Could not start the AI check: {enqueueError instanceof ApiError ? enqueueError.message : "the server could not be reached"}.
        </p>
      ) : null}
      {check && (check.status === "FAILED" || check.status === "SKIPPED") ? (
        <p role="alert" className="text-sm text-amber-700">
          {describeAiCheckReason(check.errorReason)}
        </p>
      ) : null}
      {pausedByOther && check ? (
        <p role="status" className="text-sm text-slate-600">
          The last check was paused by {providerShortName(check.provider, "another provider")}. You now use {providerName}; it is
          checked again automatically, or click “Check with {providerName}”.
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
      {(busy || paused) && results.length > 0 ? (
        <p className="text-xs text-slate-500">Showing the previous result until the new check finishes.</p>
      ) : null}
      {!check && !busy ? <p className="text-sm text-slate-500">Not checked by AI yet.</p> : null}

      {results.length > 0 ? (
        <ul className="space-y-2">
          {results.map((result) => (
            <Verdict key={`${check?.updatedAt ?? ""}:${result.ruleId}`} result={result} onUseFix={onUseFix} isProposing={isProposing} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
