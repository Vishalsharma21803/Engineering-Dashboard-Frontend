import { useState } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { buttonClassName } from "@/components/ui/button-styles";
import { cn } from "@/utils/cn";
import type { ActionKind, ProposeActionInput } from "../types/action.types";
import type { Recommendation } from "../types/azure.types";
import { CATEGORY_LABELS, actionKindLabel } from "../utils/labels";
import { EmptyState } from "./feedback";
import { StatusBadge } from "./status-badge";
import { PriorityBadge, WorkItemTypeBadge } from "./work-item-badges";
import { workItemTypeStyle } from "../utils/work-item-types";

interface RecommendationListProps {
  credentialId: string;
  recommendations: Recommendation[];
  /** Type and priority of work items referenced by recommendations. */
  workItems: Map<number, { type: string; priority: number | null }>;
  isProposing: boolean;
  onPropose: (input: ProposeActionInput) => void;
}

const PRIORITY_REASON = /^Priority \d$/;

const TARGET_BADGES = {
  pullRequest: { label: "Pull request", className: "bg-indigo-50 text-indigo-700 ring-indigo-200" },
  build: { label: "Pipeline run", className: "bg-slate-100 text-slate-700 ring-slate-200" },
} as const;

const CATEGORY_BARS: Record<Recommendation["category"], string> = {
  BLOCKER: "bg-rose-500",
  FAILED_PIPELINE: "bg-rose-500",
  REVIEW: "bg-sky-500",
  SOP: "bg-amber-400",
  STALE: "bg-slate-300",
};

function targetPath(credentialId: string, recommendation: Recommendation): string {
  const base = `/azure/${encodeURIComponent(credentialId)}`;
  const project = encodeURIComponent(recommendation.target.projectName);

  switch (recommendation.target.type) {
    case "workItem":
      return `${base}/projects/${project}/work-items/${recommendation.target.id}`;
    case "pullRequest":
      return `${base}/projects/${project}/repos/${encodeURIComponent(recommendation.target.repositoryId ?? "")}/pull-requests/${recommendation.target.id}`;
    case "build":
      return `${base}/projects/${project}?build=${recommendation.target.id}`;
  }
}

export function RecommendationList({
  credentialId,
  recommendations,
  workItems,
  isProposing,
  onPropose,
}: RecommendationListProps) {
  const [category, setCategory] = useState<Recommendation["category"] | "">("");

  if (recommendations.length === 0) {
    return <EmptyState>Nothing needs your attention right now.</EmptyState>;
  }

  const categories = (Object.keys(CATEGORY_LABELS) as Array<Recommendation["category"]>)
    .map((value) => ({ value, count: recommendations.filter((item) => item.category === value).length }))
    .filter((entry) => entry.count > 0);
  const visible = category ? recommendations.filter((item) => item.category === category) : recommendations;

  return (
    <div className="space-y-3">
      {categories.length > 1 ? (
        <div role="group" aria-label="Filter by category" className="flex flex-wrap gap-1.5">
          {[{ value: "" as const, count: recommendations.length }, ...categories].map((entry) => (
            <button
              key={entry.value || "all"}
              type="button"
              aria-pressed={category === entry.value}
              onClick={() => setCategory(entry.value)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition",
                category === entry.value
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
              )}
            >
              {entry.value ? (
                <span aria-hidden="true" className={cn("size-2 rounded-full", CATEGORY_BARS[entry.value])} />
              ) : null}
              {entry.value ? CATEGORY_LABELS[entry.value].label : "All"}
              <span className={category === entry.value ? "text-white/70" : "text-slate-400"}>{entry.count}</span>
            </button>
          ))}
        </div>
      ) : null}

      <ol className="space-y-2">
        {visible.map((recommendation, index) => {
          const category = CATEGORY_LABELS[recommendation.category];
          const suggestion = recommendation.suggestedAction;
          const workItem =
            recommendation.target.type === "workItem" ? workItems.get(recommendation.target.id) : undefined;
          const reasons = recommendation.reasons.filter((reason) => !PRIORITY_REASON.test(reason));
          const path = targetPath(credentialId, recommendation);

          return (
            <li
              key={recommendation.id}
              className="relative flex flex-col gap-3 overflow-hidden rounded-lg border border-slate-200 bg-white py-3 pl-5 pr-4 transition hover:border-slate-300 hover:shadow-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <span aria-hidden="true" className={cn("absolute inset-y-0 left-0 w-1", CATEGORY_BARS[recommendation.category])} />

              <div className="flex min-w-0 gap-3">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge tone={category.tone}>{category.label}</StatusBadge>
                    {workItem ? (
                      <WorkItemTypeBadge type={workItem.type} compact />
                    ) : recommendation.target.type !== "workItem" ? (
                      <span
                        className={cn(
                          "inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-semibold ring-1 ring-inset",
                          TARGET_BADGES[recommendation.target.type].className
                        )}
                      >
                        {TARGET_BADGES[recommendation.target.type].label}
                      </span>
                    ) : null}
                    {workItem && workItem.priority !== null ? <PriorityBadge priority={workItem.priority} /> : null}
                  </div>
                  <Link to={path} className="mt-1 block font-medium text-slate-950 hover:text-indigo-600">
                    {recommendation.title}
                  </Link>
                  {reasons.length > 0 ? (
                    <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
                      {reasons.map((reason) => (
                        <li key={reason} className="flex gap-1.5">
                          <span
                            aria-hidden="true"
                            className={cn(
                              "mt-1.5 size-1 shrink-0 rounded-full",
                              workItem ? workItemTypeStyle(workItem.type).bar : "bg-slate-400"
                            )}
                          />
                          {reason}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2 pl-9 sm:pl-4">
                {suggestion && !suggestion.requiresInput ? (
                  <Button
                    size="sm"
                    disabled={isProposing}
                    onClick={() =>
                      onPropose({
                        credentialId,
                        kind: suggestion.kind as ActionKind,
                        source: "RECOMMENDATION",
                        target: suggestion.target,
                        params: suggestion.params,
                      })
                    }
                  >
                    {actionKindLabel(suggestion.kind)}…
                  </Button>
                ) : suggestion ? (
                  <Link to={path} className={buttonClassName({ size: "sm" })}>
                    {actionKindLabel(suggestion.kind)}…
                  </Link>
                ) : null}
                <Link to={path} className={buttonClassName({ size: "sm", variant: "secondary" })}>
                  Open
                </Link>
                <span
                  className="hidden w-8 text-right text-xs tabular-nums text-slate-400 sm:inline"
                  title="Priority score"
                >
                  {recommendation.score}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
