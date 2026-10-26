import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { StatusBadge } from "@/features/azure-devops/components/status-badge";
import type { ComplianceResult, ComplianceViolation } from "@/features/azure-devops/types/azure.types";
import { SEVERITY_TONES } from "@/features/azure-devops/utils/labels";
import { AiResults, type AiResultsProps } from "./ai-results";

interface SopResultPanelProps {
  result: ComplianceResult;
  /** Optional fix button for a violation (the work item page offers one). */
  renderAction?: (violation: ComplianceViolation) => ReactNode;
  /** AI verdicts; without it the AI rules are only listed. */
  ai?: Omit<AiResultsProps, "ruleCount">;
}

function versionLabel(version: number): string {
  return version === -1 ? "draft" : `v${version}`;
}

/** One ticket's SOP result: gaps first, then what is still open, skipped or left to AI. */
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

  return (
    <div className="flex flex-col gap-3">
      {result.violations.length === 0 ? (
        <p className="text-sm text-emerald-700">No SOP gaps found by the code rules.</p>
      ) : (
        <ul className="space-y-2">
          {result.violations.map((violation) => (
            <li
              key={violation.ruleId}
              className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={SEVERITY_TONES[violation.severity]}>{violation.ruleId}</StatusBadge>
                  <span className="text-sm font-medium text-slate-900">{violation.ruleTitle}</span>
                </div>
                <span className="text-sm text-slate-700">{violation.message}</span>
                {violation.evidence.length > 0 ? (
                  <ul className="list-inside list-disc text-xs text-slate-500">
                    {violation.evidence.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
              {renderAction ? <div className="shrink-0">{renderAction(violation)}</div> : null}
            </li>
          ))}
        </ul>
      )}

      {result.pendingRules.length > 0 ? (
        <div className="text-sm text-slate-700">
          <p className="font-medium">Still open</p>
          <ul className="mt-1 space-y-0.5 text-slate-600">
            {result.pendingRules.map((rule) => (
              <li key={rule.ruleId}>
                <span className="font-mono text-xs">{rule.ruleId}</span> {rule.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {ai ? (
        <AiResults {...ai} ruleCount={result.aiRules.length} />
      ) : result.aiRules.length > 0 ? (
        <p className="text-xs text-slate-500">
          Checked by AI separately: {result.aiRules.map((rule) => `${rule.ruleId} ${rule.ruleTitle}`).join(" · ")}
        </p>
      ) : null}

      <details className="text-xs text-slate-500">
        <summary className="cursor-pointer select-none">
          {result.passedRules.length} passed · {result.skippedRules.length} not checked · rules default{" "}
          {versionLabel(result.rulebook.defaultVersion)}, yours {versionLabel(result.rulebook.personalVersion)}
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
