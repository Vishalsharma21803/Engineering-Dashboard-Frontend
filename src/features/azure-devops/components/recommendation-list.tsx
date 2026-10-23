import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import type { ActionKind, ProposeActionInput } from "../types/action.types";
import type { Recommendation } from "../types/azure.types";
import { CATEGORY_LABELS, actionKindLabel } from "../utils/labels";
import { EmptyState } from "./feedback";
import { StatusBadge } from "./status-badge";

interface RecommendationListProps {
  credentialId: string;
  recommendations: Recommendation[];
  isProposing: boolean;
  onPropose: (input: ProposeActionInput) => void;
}

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
  isProposing,
  onPropose,
}: RecommendationListProps) {
  if (recommendations.length === 0) {
    return <EmptyState>Nothing needs your attention right now.</EmptyState>;
  }

  return (
    <ol className="divide-y divide-slate-100">
      {recommendations.map((recommendation, index) => {
        const category = CATEGORY_LABELS[recommendation.category];
        const suggestion = recommendation.suggestedAction;

        return (
          <li key={recommendation.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 gap-3">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                {index + 1}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={category.tone}>{category.label}</StatusBadge>
                  <Link
                    to={targetPath(credentialId, recommendation)}
                    className="font-medium text-slate-950 hover:text-indigo-600"
                  >
                    {recommendation.title}
                  </Link>
                </div>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-slate-600">
                  {recommendation.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2 sm:pl-4">
              <span className="text-xs text-slate-400" title="Priority score">
                {recommendation.score}
              </span>
              {suggestion && !suggestion.requiresInput ? (
                <Button
                  size="sm"
                  variant="secondary"
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
                  Review: {actionKindLabel(suggestion.kind)}
                </Button>
              ) : suggestion ? (
                <Link
                  to={targetPath(credentialId, recommendation)}
                  className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-indigo-600 hover:bg-indigo-50"
                >
                  {actionKindLabel(suggestion.kind)}…
                </Link>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
