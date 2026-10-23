import { useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { ActionReviewDialog } from "../components/action-review-dialog";
import { EmptyState, ErrorCard, SectionCard, SectionView, SkeletonRows, StatTile } from "../components/feedback";
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
  const review = useActionReview();

  const compliance = useMemo(
    () =>
      new Map<number, ComplianceResult>(
        (dashboard?.sections.compliance.data ?? []).map((result) => [result.workItemId, result])
      ),
    [dashboard]
  );

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
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-600">
          Signed in to Azure DevOps as <span className="font-medium text-slate-900">{dashboard.identity.displayName}</span> ·{" "}
          {dashboard.projectsScanned} project(s) scanned · updated {formatRelative(dashboard.generatedAt)}
          {dashboard.projectsTruncated ? " · only the first 30 projects are scanned; pick a project to narrow down" : ""}
        </p>
        <Button size="sm" variant="secondary" onClick={() => void refresh()} disabled={isRefreshing}>
          {isRefreshing ? "Refreshing..." : "Refresh from Azure"}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile label="Open work items" value={dashboard.sections.workItems.data?.length ?? "—"} />
        <StatTile label="SOP gaps" value={dashboard.sections.compliance.status === "ok" ? violations : "—"} />
        <StatTile label="Active PRs" value={dashboard.sections.pullRequests.data?.length ?? "—"} />
        <StatTile label="Failing pipelines" value={dashboard.sections.pipelines.status === "ok" ? failedBuilds : "—"} hint="latest run per branch" />
        <Link to="/actions" className="block">
          <StatTile label="Awaiting approval" value={pending} hint="proposed changes" />
        </Link>
      </div>

      {review.proposeError ? (
        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
          {review.proposeError}
        </p>
      ) : null}

      <SectionCard
        title="Prioritized actions"
        description="Blockers, failed pipelines, review requests and SOP gaps, highest priority first. Changes are only proposed until you approve them."
      >
        <RecommendationList
          credentialId={credentialId}
          recommendations={dashboard.recommendations}
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
            {(builds) =>
              builds.length === 0 ? (
                <EmptyState>No pipeline runs requested by you in the last week.</EmptyState>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {builds.map((build) => (
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
              )
            }
          </SectionView>
        </SectionCard>
      </div>

      <ScopesCard credentialId={credentialId} />

      <ActionReviewDialog action={review.reviewing} onClose={review.closeReview} />
    </div>
  );
}
