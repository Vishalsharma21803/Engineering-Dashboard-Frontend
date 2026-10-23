import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { ActionReviewDialog } from "../components/action-review-dialog";
import { EmptyState, ErrorCard, ErrorToast, SectionCard, SectionView, SkeletonRows, StatTile } from "../components/feedback";
import { FilterBar } from "../components/filter-bar";
import { PullRequestList } from "../components/pull-request-list";
import { RecommendationList } from "../components/recommendation-list";
import { ScopesCard } from "../components/scopes-card";
import { StatusBadge } from "../components/status-badge";
import { WorkItemTable } from "../components/work-item-table";
import { useActionReview } from "../hooks/use-action-review";
import { useActions } from "../hooks/use-actions";
import { useDashboard } from "../hooks/use-dashboard";
import type { ComplianceResult } from "../types/azure.types";
import { formatRelative, stripRef } from "../utils/format";
import { buildLabel, buildTone } from "../utils/labels";

export function DashboardPage() {
  const { credentialId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("project") ?? undefined;
  const { data: dashboard, isLoading, error, refetch, refresh, isRefreshing } = useDashboard(credentialId, projectId);
  const pendingActions = useActions("PENDING");
  const [runFilter, setRunFilter] = useState("");
  const review = useActionReview();

  const compliance = useMemo(
    () =>
      new Map<number, ComplianceResult>(
        (dashboard?.sections.compliance.data ?? []).map((result) => [result.workItemId, result])
      ),
    [dashboard]
  );

  const workItemKinds = useMemo(() => {
    const kinds = new Map<number, { type: string; priority: number | null }>();
    for (const result of dashboard?.sections.compliance.data ?? []) {
      kinds.set(result.workItemId, { type: result.type, priority: null });
    }
    for (const item of dashboard?.sections.workItems.data ?? []) {
      kinds.set(item.id, { type: item.type, priority: item.priority });
    }
    return kinds;
  }, [dashboard]);

  if (isLoading) {
    return <SkeletonRows rows={6} />;
  }

  if (error || !dashboard) {
    return <ErrorCard error={error} credentialId={credentialId} onRetry={() => void refetch()} />;
  }

  const violations = (dashboard.sections.compliance.data ?? []).reduce(
    (total, result) => total + result.violations.length,
    0
  );
  const failedBuilds = (dashboard.sections.pipelines.data ?? []).filter(
    (build) => build.status === "completed" && build.result === "failed"
  ).length;
  const pending = pendingActions.data?.length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">
            {dashboard.identity.displayName
              .split(/\s+/)
              .map((part) => part[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()}
          </span>
          <div className="text-sm">
            <p className="font-medium text-slate-950">{dashboard.identity.displayName}</p>
            <p className="text-slate-500">
              Only your work: items assigned to you, PRs you authored or review, runs you triggered ·{" "}
              {dashboard.projectsScanned} project(s) · updated {formatRelative(dashboard.generatedAt)}
            </p>
          </div>
        </div>
        <Button size="sm" onClick={() => void refresh()} disabled={isRefreshing}>
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" className={isRefreshing ? "size-4 animate-spin" : "size-4"}>
            <path d="M16 10a6 6 0 1 1-1.76-4.24M16 4v3h-3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {isRefreshing ? "Refreshing..." : "Refresh from Azure"}
        </Button>
      </div>

      {dashboard.projectsTruncated ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          Only the first 30 projects are scanned. Choose a project above to narrow the view.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile label="Open work items" value={dashboard.sections.workItems.data?.length ?? "—"} />
        <StatTile label="SOP gaps" value={dashboard.sections.compliance.status === "ok" ? violations : "—"} />
        <StatTile label="Active PRs" value={dashboard.sections.pullRequests.data?.length ?? "—"} />
        <StatTile label="Failing pipelines" value={dashboard.sections.pipelines.status === "ok" ? failedBuilds : "—"} hint="latest run per branch" />
        <Link to={`/azure/${encodeURIComponent(credentialId)}/actions`} className="block rounded-xl transition hover:-translate-y-0.5 hover:shadow-md">
          <StatTile label="Awaiting approval" value={pending} hint="proposed changes" />
        </Link>
      </div>

      <SectionCard
        title="Prioritized actions"
        description="Blockers, failed pipelines, review requests and SOP gaps, highest priority first. Changes are only proposed until you approve them."
      >
        <RecommendationList
          credentialId={credentialId}
          recommendations={dashboard.recommendations}
          workItems={workItemKinds}
          isProposing={review.isProposing}
          onPropose={(input) => review.propose(input)}
        />
      </SectionCard>

      <SectionCard title="My work items" description="Assigned to you, with SOP compliance indicators.">
        <SectionView section={dashboard.sections.workItems} label="work items">
          {(workItems) => <WorkItemTable credentialId={credentialId} workItems={workItems} compliance={compliance} />}
        </SectionView>
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard title="Pull requests & reviews">
          <SectionView section={dashboard.sections.pullRequests} label="pull requests">
            {(pullRequests) => <PullRequestList credentialId={credentialId} pullRequests={pullRequests} />}
          </SectionView>
        </SectionCard>

        <SectionCard title="My recent pipeline runs" description="Latest run per pipeline and branch, last 7 days.">
          <SectionView section={dashboard.sections.pipelines} label="pipelines">
            {(builds) => {
              const label = (build: (typeof builds)[number]) => buildLabel(build.status, build.result);
              const results = [...new Set(builds.map(label))];
              const visibleBuilds = runFilter ? builds.filter((build) => label(build) === runFilter) : builds;

              return builds.length === 0 ? (
                <EmptyState>No pipeline runs requested by you in the last week.</EmptyState>
              ) : (
                <div className="space-y-3">
                  {results.length > 1 ? (
                    <FilterBar
                      filters={[
                        {
                          id: "result",
                          label: "Result",
                          value: runFilter,
                          options: results.map((value) => ({
                            value,
                            label: value,
                            count: builds.filter((build) => label(build) === value).length,
                          })),
                          onChange: setRunFilter,
                        },
                      ]}
                      shown={visibleBuilds.length}
                      total={builds.length}
                      onClear={() => setRunFilter("")}
                    />
                  ) : null}
                  <ul className="divide-y divide-slate-100">
                    {visibleBuilds.map((build) => (
                      <li key={build.id} className="flex items-center justify-between gap-2 py-2.5">
                        <Link
                          to={`/azure/${encodeURIComponent(credentialId)}/projects/${encodeURIComponent(build.projectName ?? "")}?build=${build.id}`}
                          className="min-w-0 truncate text-sm text-slate-800 hover:text-indigo-600"
                        >
                          <span className="font-medium">{build.definitionName}</span> #{build.buildNumber} · {stripRef(build.sourceBranch)} ·{" "}
                          {formatRelative(build.queueTime)}
                        </Link>
                        <StatusBadge tone={buildTone(build.status, build.result)}>{buildLabel(build.status, build.result)}</StatusBadge>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            }}
          </SectionView>
        </SectionCard>
      </div>

      <ScopesCard credentialId={credentialId} />

      <ActionReviewDialog action={review.reviewing} onClose={review.closeReview} />
      <ErrorToast message={review.proposeError} onDismiss={review.clearProposeError} />
    </div>
  );
}
