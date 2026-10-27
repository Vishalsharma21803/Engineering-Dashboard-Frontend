import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";

import { Pagination } from "@/components/ui/pagination";
import { usePageParam, useSyncServedPage } from "@/hooks/use-page-param";

import { Button } from "@/components/ui/button";
import { buttonClassName } from "@/components/ui/button-styles";
import { cn } from "@/utils/cn";
import { listRecommendations } from "../api/azure.api";
import { azureKeys } from "../api/azure.keys";
import type { DashboardTriage } from "../hooks/use-triage";
import type { ActionKind, ProposeActionInput } from "../types/action.types";
import type { Recommendation } from "../types/azure.types";
import type { ResolvedTriage } from "../types/triage.types";
import { CATEGORY_LABELS, actionKindLabel } from "../utils/labels";
import { movedByPendingMark } from "../utils/triage";
import { retryUnlessClientError } from "../utils/query-retry";
import { EmptyState, ErrorCard, SkeletonRows } from "./feedback";
import { StatusBadge } from "./status-badge";
import { HiddenToggle, TriageBadge, TriageMenu } from "./triage-menu";
import { PriorityBadge, WorkItemTypeBadge } from "./work-item-badges";
import { workItemTypeStyle } from "../utils/work-item-types";

interface RecommendationListProps {
  credentialId: string;
  projectId: string | undefined;
  /** Changes whenever the dashboard reloads, so the page reloads with it. */
  dashboardToken: string;
  /** Type and priority of work items referenced by recommendations. */
  workItems: Map<number, { type: string; priority: number | null }>;
  isProposing: boolean;
  onPropose: (input: ProposeActionInput) => void;
  triage: DashboardTriage;
}

interface Entry {
  recommendation: Recommendation;
  itemKey: string | null;
  resolved: ResolvedTriage;
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

/** Highest priority first, 10 per page, filtered by the server. The page lives in the URL (?actionsPage=). */
export function RecommendationList({ credentialId, projectId, dashboardToken, workItems, isProposing, onPropose, triage }: RecommendationListProps) {
  const pageParam = usePageParam("actionsPage");
  const { page, setPage } = pageParam;
  const [category, setCategory] = useState<Recommendation["category"] | "">("");
  const [showHiddenChoice, setShowHidden] = useState(false);
  const query = useQuery({
    queryKey: [...azureKeys.recommendations(credentialId, projectId), { page, category, showHidden: showHiddenChoice, token: dashboardToken, triage: triage.savedVersion }],
    queryFn: () => listRecommendations(credentialId, projectId, { page, hidden: showHiddenChoice, category }),
    placeholderData: keepPreviousData,
    retry: retryUnlessClientError,
  });
  useSyncServedPage(pageParam, query.isPlaceholderData ? undefined : query.data?.page);

  if (query.isLoading) {
    return <SkeletonRows rows={4} />;
  }

  if (query.error || !query.data) {
    return <ErrorCard error={query.error} credentialId={credentialId} onRetry={() => void query.refetch()} />;
  }

  const data = query.data;

  if (data.poolTotal === 0 && data.hiddenCount === 0) {
    return <EmptyState>Nothing needs your attention right now.</EmptyState>;
  }

  const showHidden = data.showingHidden;
  const hiddenCount = data.hiddenCount;
  const entries: Array<Entry & { rank: number | null }> = data.items
    .map(({ recommendation, rank }) => {
      const itemKey = triage.keyFor(recommendation);
      return { recommendation, itemKey, rank, resolved: triage.resolve(itemKey, recommendation.target.projectName) };
    })
    .filter((entry) => !movedByPendingMark(entry.resolved, showHidden));
  const categories = data.facets.categories;
  const active = entries.filter((entry) => entry.rank !== null);
  const acknowledged = entries.filter((entry) => entry.rank === null);
  const choose = (value: Recommendation["category"] | "") => {
    setCategory(value);
    setPage(1, { replace: true });
  };

  function renderItem({ recommendation, itemKey, resolved }: Entry, rank: number | null) {
    const category = CATEGORY_LABELS[recommendation.category];
    const suggestion = recommendation.suggestedAction;
    const workItem =
      recommendation.target.type === "workItem" ? workItems.get(recommendation.target.id) : undefined;
    const reasons = recommendation.reasons.filter((reason) => !PRIORITY_REASON.test(reason));
    const path = targetPath(credentialId, recommendation);
    const muted = resolved.state !== "active";

    return (
      <li
        key={recommendation.id}
        className={cn(
          "relative flex flex-col gap-3 overflow-hidden rounded-lg border border-slate-200 py-3 pl-5 pr-4 transition hover:border-slate-300 hover:shadow-sm sm:flex-row sm:items-center sm:justify-between",
          muted ? "bg-slate-50" : "bg-white"
        )}
      >
        <span aria-hidden="true" className={cn("absolute inset-y-0 left-0 w-1", muted ? "bg-slate-200" : CATEGORY_BARS[recommendation.category])} />

        <div className={cn("flex min-w-0 gap-3", muted && "opacity-75")}>
          <span
            className={cn(
              "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
              rank === null ? "bg-slate-200 text-slate-500" : "bg-slate-900 text-white"
            )}
          >
            {rank ?? "–"}
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
              <TriageBadge resolved={resolved} />
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
          <TriageMenu
            triage={triage}
            itemKey={itemKey}
            projectName={recommendation.target.projectName}
            label={recommendation.title}
            resolved={resolved}
          />
          <span
            className="hidden w-8 text-right text-xs tabular-nums text-slate-400 sm:inline"
            title="Priority score"
          >
            {recommendation.score}
          </span>
        </div>
      </li>
    );
  }

  return (
    <div className="space-y-3">
      {categories.length > 1 || category || hiddenCount > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {categories.length > 1 || category ? (
            <div role="group" aria-label="Filter by category" className="flex flex-wrap gap-1.5">
              {[{ value: "" as const, count: data.poolTotal }, ...categories].map((entry) => (
                <button
                  key={entry.value || "all"}
                  type="button"
                  aria-pressed={category === entry.value}
                  onClick={() => choose(entry.value)}
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
          ) : (
            <span />
          )}
          <HiddenToggle
            count={hiddenCount}
            shown={showHidden}
            onToggle={() => {
              setShowHidden(!showHidden);
              setPage(1, { replace: true });
            }}
          />
        </div>
      ) : null}

      {showHidden ? (
        <ol aria-label="Snoozed and abandoned" className="space-y-2">
          {entries.map((entry) => renderItem(entry, null))}
        </ol>
      ) : (
        <>
          {active.length > 0 ? (
            <ol className="space-y-2">{active.map((entry) => renderItem(entry, entry.rank))}</ol>
          ) : data.activeTotal === 0 ? (
            <EmptyState>
              Nothing needs your attention right now
              {data.acknowledgedTotal > 0 || hiddenCount > 0 ? " — everything left is acknowledged, snoozed or abandoned." : "."}
            </EmptyState>
          ) : null}

          {acknowledged.length > 0 ? (
            <section aria-label="Acknowledged" className="space-y-2 pt-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Acknowledged · {data.acknowledgedTotal}</h3>
              <ol className="space-y-2">{acknowledged.map((entry) => renderItem(entry, null))}</ol>
            </section>
          ) : null}
        </>
      )}

      <Pagination
        label="Prioritized action pages"
        page={data.page}
        totalPages={data.totalPages}
        total={data.total}
        pageSize={data.pageSize}
        disabled={query.isFetching}
        onChange={(next) => setPage(next)}
      />
    </div>
  );
}
