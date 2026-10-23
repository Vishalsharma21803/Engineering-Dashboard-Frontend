import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { cn } from "@/utils/cn";

import type { DashboardTriage } from "../hooks/use-triage";
import type { PullRequestSummary } from "../types/azure.types";
import { formatRelative } from "../utils/format";
import { voteFromValue } from "../utils/labels";
import { UNTRIAGED, isHidden, pullRequestKey } from "../utils/triage";
import {
  EMPTY_PR_FILTERS,
  matchesPullRequest,
  pullRequestFilterOptions,
  type PullRequestFilters,
} from "../utils/pull-request-filters";
import { EmptyState } from "./feedback";
import { FilterBar } from "./filter-bar";
import { StatusBadge } from "./status-badge";
import { HiddenToggle, TriageBadge, TriageMenu } from "./triage-menu";

interface PullRequestListProps {
  credentialId: string;
  pullRequests: PullRequestSummary[];
  emptyMessage?: string;
  /** team: filter by author instead of my role. */
  scope?: "mine" | "team";
  /** Dashboard snooze / acknowledge / abandon state; omitted for team lists. */
  triage?: DashboardTriage;
}

function mergeBadge(pr: PullRequestSummary) {
  if (pr.isDraft) return <StatusBadge tone="neutral">Draft</StatusBadge>;
  if (pr.mergeStatus === "conflicts") return <StatusBadge tone="danger">Conflicts</StatusBadge>;
  if (pr.rejections > 0) return <StatusBadge tone="warning">Changes requested</StatusBadge>;
  if (pr.approvals > 0) return <StatusBadge tone="success">{pr.approvals} approval(s)</StatusBadge>;
  return <StatusBadge tone="info">Awaiting review</StatusBadge>;
}

export function PullRequestList({
  credentialId,
  pullRequests,
  emptyMessage = "No active pull requests authored by you or awaiting your review.",
  scope = "mine",
  triage,
}: PullRequestListProps) {
  const team = scope === "team";
  const [filters, setFilters] = useState<PullRequestFilters>(EMPTY_PR_FILTERS);
  const [showHiddenChoice, setShowHidden] = useState(false);
  const options = useMemo(() => pullRequestFilterOptions(pullRequests, team), [pullRequests, team]);

  if (pullRequests.length === 0) {
    return <EmptyState>{emptyMessage}</EmptyState>;
  }

  const keyOf = (pr: PullRequestSummary) => pullRequestKey(pr.repositoryId, pr.pullRequestId);
  const resolved = new Map(
    pullRequests.map((pr) => [keyOf(pr), triage ? triage.resolve(keyOf(pr), pr.projectName) : UNTRIAGED])
  );
  const triageOf = (pr: PullRequestSummary) => resolved.get(keyOf(pr)) ?? UNTRIAGED;
  const hiddenCount = pullRequests.filter((pr) => isHidden(triageOf(pr).state)).length;
  const showHidden = showHiddenChoice && hiddenCount > 0;
  const pool = pullRequests.filter((pr) => isHidden(triageOf(pr).state) === showHidden);
  const visible = pool.filter((pr) => matchesPullRequest(pr, filters, team));
  const set = (key: keyof PullRequestFilters) => (value: string) => setFilters({ ...filters, [key]: value });

  return (
    <div className="space-y-3">
      <FilterBar
        search={{ value: filters.search, onChange: set("search"), placeholder: "Search PR, title or branch" }}
        filters={[
          { id: "person", label: team ? "Author" : "Role", value: filters.person, options: options.person, onChange: set("person") },
          { id: "review", label: "Review", value: filters.review, options: options.review, onChange: set("review") },
          ...(options.repositories.length > 1
            ? [{ id: "repository", label: "Repo", value: filters.repository, options: options.repositories, onChange: set("repository") }]
            : []),
        ]}
        shown={visible.length}
        total={pool.length}
        onClear={() => setFilters(EMPTY_PR_FILTERS)}
      />
      {hiddenCount > 0 ? (
        <div className="flex justify-end">
          <HiddenToggle count={hiddenCount} shown={showHidden} onToggle={() => setShowHidden(!showHidden)} />
        </div>
      ) : null}
      <ul className="divide-y divide-slate-100">
        {visible.map((pr) => (
          <li
            key={`${pr.repositoryId}:${pr.pullRequestId}`}
            className={cn("flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between", triageOf(pr).state !== "active" && "opacity-75")}
          >
            <div className="min-w-0">
              <Link
                to={`/azure/${encodeURIComponent(credentialId)}/projects/${encodeURIComponent(pr.projectId)}/repos/${encodeURIComponent(pr.repositoryId)}/pull-requests/${pr.pullRequestId}`}
                className="font-medium text-slate-950 hover:text-indigo-600"
              >
                !{pr.pullRequestId} {pr.title}
              </Link>
              <p className="mt-0.5 text-xs text-slate-500">
                {pr.repositoryName} · {pr.sourceBranch} → {pr.targetBranch} · {pr.myRole === "author" ? "You authored" : `by ${pr.createdBy.displayName}`} · {formatRelative(pr.creationDate)}
                {pr.myRole === "reviewer" ? " · you're a reviewer" : ""}
              </p>
              {pr.myRole === "reviewer" && pr.myVote !== null ? (
                <p className="mt-1 text-xs text-slate-600">
                  Your vote: {voteFromValue(pr.myVote).label}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
              <TriageBadge resolved={triageOf(pr)} />
              {mergeBadge(pr)}
              {pr.unresolvedThreads ? (
                <StatusBadge tone="warning">{pr.unresolvedThreads} unresolved</StatusBadge>
              ) : null}
              {triage ? (
                <TriageMenu
                  triage={triage}
                  itemKey={keyOf(pr)}
                  projectName={pr.projectName}
                  label={`!${pr.pullRequestId} ${pr.title}`}
                  resolved={triageOf(pr)}
                />
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {visible.length === 0 ? (
        <EmptyState>
          {pool.length === 0 && !showHidden
            ? "All your pull requests are snoozed or abandoned."
            : "No pull requests match these filters."}
        </EmptyState>
      ) : null}
    </div>
  );
}
