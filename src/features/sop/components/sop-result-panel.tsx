import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { PartialReadNotice } from "@/features/azure-devops/components/feedback";
import { StatusBadge } from "@/features/azure-devops/components/status-badge";
import type { ComplianceResult, ComplianceViolation } from "@/features/azure-devops/types/azure.types";
import { SEVERITY_TONES } from "@/features/azure-devops/utils/labels";
import type { AiRuleResult } from "../types/sop.types";
import { rulebookVersionsLabel } from "../utils/rule-labels";
import { currentVerdicts } from "../utils/ai-check";
import { AiReviewHeader, AiRuleReview, type AiReviewProps } from "./ai-results";

interface SopResultPanelProps {
  result: ComplianceResult;
  /** Optional fix button for a finding (the work item page offers one). */
  renderAction?: (finding: ComplianceViolation) => ReactNode;
  /** The ticket's AI review; without it only the code results are shown. */
  ai?: AiReviewProps;
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** One finding (to-do, gap or notice) with its evidence, fix button and the AI's review of it. */
function Finding({ finding, label, renderAction, review, ai }: { finding: ComplianceViolation; label: string; renderAction: SopResultPanelProps["renderAction"]; review: AiRuleResult | undefined; ai: AiReviewProps | undefined }) {
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={SEVERITY_TONES[finding.severity]}>{finding.ruleId}</StatusBadge>
            <span className="text-sm font-medium text-slate-900">{finding.ruleTitle}</span>
            <span className="text-xs text-slate-500">{label}</span>
            {finding.checker === "ai" ? <span className="text-xs text-slate-500">· judged by AI</span> : null}
          </div>
          {/* An AI-only rule's message is the AI's reason, shown with its review below. */}
          {review && finding.checker === "ai" ? null : <span className="text-sm text-slate-700">{finding.message}</span>}
          {finding.evidence.length > 0 ? (
            <ul className="list-inside list-disc text-xs text-slate-500">
              {finding.evidence.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
        </div>
        {renderAction ? <div className="shrink-0">{renderAction(finding)}</div> : null}
      </div>
      {review ? <AiRuleReview result={review} {...(ai?.onUseFix ? { onUseFix: ai.onUseFix } : {})} isProposing={ai?.isProposing ?? false} /> : null}
    </li>
  );
}

/**
 * One ticket's SOP result. Code decides: what is needed in the ticket's
 * current stage (to-dos, and gaps due now), gaps missed in earlier stages,
 * notices, and what passed. The AI review on top can clear a finding written
 * another way, adds advice and drafts fixes; it never adds a gap by itself.
 */
export function SopResultPanel({ result, renderAction, ai }: SopResultPanelProps) {
  if (!result.configured) {
    return (
      <p className="text-sm text-slate-600">
        {result.sopProject === "switched-off"
          ? `You switched SOP checks off for ${result.projectName}, so this ticket is not checked.`
          : `${result.projectName} is not set up for SOP checks yet, so this ticket is not checked.`}{" "}
        <Link to="/sop-rules?tab=projects" className="font-medium text-indigo-700 hover:underline">
          {result.sopProject === "switched-off" ? "Your SOP projects" : "Set it up"}
        </Link>
      </p>
    );
  }

  const verdicts = currentVerdicts(ai?.check, ai?.rev ?? -1);
  const now = [...result.violations.filter((finding) => finding.phase === "now"), ...result.todos];
  const earlier = result.violations.filter((finding) => finding.phase === "earlier");
  const shown = new Set([...now, ...earlier, ...result.notices].map((finding) => finding.ruleId));
  const cleared = new Set(result.cleared.map((rule) => rule.ruleId));
  // AI notes not attached to a finding above: advice on rules code passed, and rules only AI judges.
  const otherReviews = [...verdicts.values()].filter(
    (verdict) => !shown.has(verdict.ruleId) && !cleared.has(verdict.ruleId) && (verdict.review === "ai-rule" || (verdict.review === "quality" && verdict.verdict === "fail"))
  );
  const label = (finding: ComplianceViolation) => (result.violations.includes(finding) ? "gap" : "to do");

  return (
    <div className="flex flex-col gap-5">
      {ai ? (
        <AiReviewHeader
          {...ai}
          reviewable={now.length + earlier.length + result.notices.length + result.passedRules.length > 0}
          reviewOutdated={result.aiReview?.outdated === true}
        />
      ) : null}
      <PartialReadNotice
        messages={[result.historyTruncated ? "Part of this ticket's long history was not read, so some SOP checks may be incomplete." : null]}
      />

      <Section title="Needed now" hint="What this stage needs. To-dos are not gaps yet; they become gaps if the ticket moves on without them.">
        {now.length === 0 ? (
          <p className="text-sm text-emerald-700">Nothing needed in this stage.</p>
        ) : (
          <ul className="space-y-2">
            {now.map((finding) => (
              <Finding key={`${finding.checker}:${finding.ruleId}`} finding={finding} label={label(finding)} renderAction={renderAction} review={verdicts.get(finding.ruleId)} ai={ai} />
            ))}
          </ul>
        )}
      </Section>

      {earlier.length > 0 ? (
        <Section title="Gaps from earlier stages" hint="Missed before the ticket moved on. They stay gaps until fixed.">
          <ul className="space-y-2">
            {earlier.map((finding) => (
              <Finding key={`${finding.checker}:${finding.ruleId}`} finding={finding} label="gap" renderAction={renderAction} review={verdicts.get(finding.ruleId)} ai={ai} />
            ))}
          </ul>
        </Section>
      ) : null}

      {result.notices.length > 0 ? (
        <Section title="Notices (not counted as gaps)">
          <ul className="space-y-2">
            {result.notices.map((finding) => (
              <Finding key={`${finding.checker}:${finding.ruleId}`} finding={finding} label="notice" renderAction={renderAction} review={verdicts.get(finding.ruleId)} ai={ai} />
            ))}
          </ul>
        </Section>
      ) : null}

      {result.cleared.length > 0 ? (
        <Section title="Cleared by AI" hint="Code did not recognise these, but the AI review found them in the ticket. They count as met until the ticket changes.">
          <ul className="space-y-2">
            {result.cleared.map((rule) => (
              <li key={rule.ruleId} className="flex flex-col gap-1 rounded-lg border border-emerald-200 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone="success">{rule.ruleId}</StatusBadge>
                  <span className="text-sm font-medium text-slate-900">{rule.ruleTitle}</span>
                </div>
                <p className="text-sm text-slate-700">{rule.reason}</p>
                {rule.quotes.map((quote, index) => (
                  <p key={`${index}:${quote}`} className="border-l-2 border-slate-300 pl-2 text-xs italic text-slate-600">
                    “{quote}”
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {otherReviews.length > 0 ? (
        <Section title="More from the AI review">
          <div className="flex flex-col gap-2">
            {otherReviews.map((review) => (
              <AiRuleReview key={review.ruleId} result={review} showRule {...(ai?.onUseFix ? { onUseFix: ai.onUseFix } : {})} isProposing={ai?.isProposing ?? false} />
            ))}
          </div>
        </Section>
      ) : null}

      {!ai && result.aiRules.length > 0 ? (
        <p className="text-xs text-slate-500">Judged by AI on the ticket page: {result.aiRules.map((rule) => `${rule.ruleId} ${rule.ruleTitle}`).join(" · ")}</p>
      ) : null}

      <details className="text-xs text-slate-500">
        <summary className="cursor-pointer select-none">
          {result.passedRules.length} passed · {result.skippedRules.length} not checked ·{" "}
          {rulebookVersionsLabel(result.rulebook.defaultVersion, result.rulebook.personalVersion)}
        </summary>
        <ul className="mt-2 space-y-0.5">
          {result.passedRules.map((rule) => (
            <li key={rule.ruleId}>
              ✓ <span className="font-mono">{rule.ruleId}</span> {rule.ruleTitle}
            </li>
          ))}
          {result.skippedRules.map((rule) => (
            <li key={rule.ruleId}>
              – <span className="font-mono">{rule.ruleId}</span> {rule.ruleTitle}: {rule.reason}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
