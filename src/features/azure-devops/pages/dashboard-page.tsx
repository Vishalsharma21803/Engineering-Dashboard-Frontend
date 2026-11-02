import { useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { useLinkedSolidtime } from "@/features/solidtime/hooks/use-solidtime";
import { ActionReviewDialog } from "../components/action-review-dialog";
import { ErrorCard, ErrorToast, SectionCard, SectionView, SkeletonRows, StaleDataBanner, StatTile } from "../components/feedback";
import { PipelineRunList } from "../components/pipeline-run-list";
import { PullRequestList } from "../components/pull-request-list";
import { RecommendationList } from "../components/recommendation-list";
import { ScopesCard } from "../components/scopes-card";
import { MyWorkTable } from "../components/work-item-table";
import { useActionReview } from "../hooks/use-action-review";
import { useActions } from "../hooks/use-actions";
import { useDashboard } from "../hooks/use-dashboard";
import { useDashboardTriage } from "../hooks/use-triage";
import type { ComplianceResult, Dashboard } from "../types/azure.types";
import { formatDateTime, formatRelative } from "../utils/format";
import { isHidden, pipelineKey, pullRequestKey, workItemKey } from "../utils/triage";

/** Original-case project names, since project triage keys are lower-cased. */
function projectNames(dashboard: Dashboard): Map<string, string> {
  const names = [
    ...(dashboard.sections.workItems.data ?? []).map((item) => item.projectName),
    ...(dashboard.sections.pullRequests.data ?? []).map((pr) => pr.projectName),
    ...(dashboard.sections.pipelines.data ?? []).map((build) => build.projectName ?? ""),
    ...dashboard.recommendations.map((item) => item.target.projectName),
  ].filter(Boolean);

  return new Map(names.map((name) => [name.toLowerCase(), name]));
}

const hiddenHint = (count: number, base?: string) =>
  count > 0 ? [base, `${count} hidden`].filter(Boolean).join(" · ") : base;

export function DashboardPage() {
  const { credentialId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("project") ?? undefined;
  const { data: dashboard, isLoading, error, refetch, refresh, isRefreshing } = useDashboard(credentialId, projectId);
  // The same count as the organization's "Approvals" badge.
  const pendingActions = useActions({ status: "PENDING", credentialId });
  const review = useActionReview();
  const triage = useDashboardTriage(credentialId, dashboard);
  const linkedTime = useLinkedSolidtime(credentialId);

  // Code results with the user's saved AI reviews applied by the server. The dashboard never calls the AI:
  // a ticket is reviewed when it is opened.
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

  if (isLoading || triage.isLoading) {
    return <SkeletonRows rows={6} />;
  }

  if (!dashboard) {
    return <ErrorCard error={error} credentialId={credentialId} onRetry={() => void refetch()} />;
  }

  // Sections that could not be read: the lists and counts below would otherwise look complete.
  const failedSections = (
    [
      ["your work items", dashboard.sections.workItems],
      ["SOP checks", dashboard.sections.compliance],
      ["pull requests", dashboard.sections.pullRequests],
      ["pipelines", dashboard.sections.pipelines],
    ] as const
    // "forbidden" (the PAT lacks a scope) is explained in its own section; this is for reads that failed.
  ).filter(([, section]) => section.status === "error");

  // Counts leave out snoozed and abandoned items; acknowledged ones are still on the list.
  const hidden = (itemKey: string | null, projectName: string | null) =>
    isHidden(triage.resolve(itemKey, projectName).state);
  const openWorkItems = (dashboard.sections.workItems.data ?? []).filter(
    (item) => !hidden(workItemKey(item.id), item.projectName)
  );
  const hiddenWorkItems = (dashboard.sections.workItems.data?.length ?? 0) - openWorkItems.length;
  const violations = [...compliance.values()]
    .filter((result) => !hidden(workItemKey(result.workItemId), result.projectName))
    .reduce((total, result) => total + result.violations.length, 0);
  const activePullRequests = (dashboard.sections.pullRequests.data ?? []).filter(
    (pr) => !hidden(pullRequestKey(pr.repositoryId, pr.pullRequestId), pr.projectName)
  );
  const hiddenPullRequests = (dashboard.sections.pullRequests.data?.length ?? 0) - activePullRequests.length;
  const failed = (dashboard.sections.pipelines.data ?? []).filter(
    (build) => build.status === "completed" && build.result === "failed"
  );
  const failedBuilds = failed.filter((build) => !hidden(pipelineKey(build), build.projectName)).length;
  const pending = pendingActions.data ? pendingActions.data.total : "—";
  const names = projectNames(dashboard);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">
            {dashboard.identity.displayName
              .split(/\s+/)
              .map((part) => part[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()}
          </span>
          <div className="min-w-0 text-sm">
            <p className="font-medium text-slate-950">{dashboard.identity.displayName}</p>
            <p className="text-slate-500">
              Only your work: items assigned to you, PRs you authored or review, runs you triggered ·{" "}
              {dashboard.projectsScanned} {dashboard.projectsScanned === 1 ? "project" : "projects"} · updated {formatRelative(dashboard.generatedAt)}
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

      {triage.loadError ? (
        <p role="status" className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          Your snoozed, acknowledged and abandoned marks could not be loaded ({triage.loadError instanceof Error ? triage.loadError.message : "unknown error"}), so everything is shown.
          <Button size="sm" variant="ghost" disabled={triage.isRetryingLoad} onClick={triage.retryLoad}>
            {triage.isRetryingLoad ? "Retrying…" : "Retry"}
          </Button>
        </p>
      ) : null}

      {triage.projectMarks.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-surface px-4 py-3 sm:flex-row sm:items-center">
          <p className="shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-500">Triaged projects</p>
          <ul className="flex flex-wrap gap-2">
            {triage.projectMarks.map((mark) => {
              const name = names.get(mark.itemKey.slice("project:".length)) ?? mark.itemKey.slice("project:".length);
              const status =
                mark.status === "SNOOZED"
                  ? `snoozed until ${formatDateTime(mark.snoozedUntil)}`
                  : mark.status === "ACKNOWLEDGED"
                    ? "acknowledged"
                    : "abandoned";

              return (
                <li key={mark.id} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 py-1 pl-3 pr-1 text-xs text-slate-700">
                  <span>
                    <span className="font-medium text-slate-900">{name}</span> · {status}
                  </span>
                  <button
                    type="button"
                    onClick={() => triage.clear(mark)}
                    disabled={!triage.ready || triage.isSaving}
                    aria-label={`Restore project ${name}`}
                    className="rounded-full bg-surface px-2 py-0.5 font-medium text-indigo-600 ring-1 ring-slate-200 transition hover:text-indigo-800 disabled:opacity-50"
                  >
                    Restore
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {error ? <StaleDataBanner credentialId={credentialId} error={error} onRetry={() => void refresh()} isRetrying={isRefreshing} /> : null}

      {failedSections.length > 0 ? (
        <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          Could not read {failedSections.map(([label]) => label).join(", ")} from Azure DevOps, so the counts and prioritized actions below are incomplete.
          Use “Refresh from Azure” to try again.
        </p>
      ) : null}

      {dashboard.projectsTruncated ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          Only the first 30 projects are scanned. Choose a project above to narrow the view.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile
          label="Open work items"
          value={dashboard.sections.workItems.data ? openWorkItems.length : "—"}
          hint={hiddenHint(hiddenWorkItems)}
        />
        <StatTile label="SOP gaps" value={dashboard.sections.compliance.status === "ok" ? violations : "—"} />
        <StatTile
          label="Active PRs"
          value={dashboard.sections.pullRequests.data ? activePullRequests.length : "—"}
          hint={hiddenHint(hiddenPullRequests)}
        />
        <StatTile
          label="Failing pipelines"
          value={dashboard.sections.pipelines.status === "ok" ? failedBuilds : "—"}
          hint={hiddenHint(failed.length - failedBuilds, "latest run per branch")}
        />
        <Link to={`/azure/${encodeURIComponent(credentialId)}/actions`} className="block rounded-xl transition hover:-translate-y-0.5 hover:shadow-md">
          <StatTile label="Awaiting approval" value={pending} hint={pendingActions.error && !pendingActions.data ? "could not be loaded" : "proposed changes"} />
        </Link>
      </div>

      <SectionCard
        title="Prioritized actions"
        description="Blockers, failed pipelines, review requests and SOP gaps, highest priority first. Changes are only proposed until you approve them."
      >
        <RecommendationList
          credentialId={credentialId}
          projectId={projectId}
          dashboardToken={dashboard.generatedAt}
          workItems={workItemKinds}
          isProposing={review.isProposing}
          onPropose={(input) => review.propose(input)}
          triage={triage}
        />
      </SectionCard>

      <SectionCard title="My work items" description="Assigned to you, with SOP compliance indicators. 10 per page.">
        <SectionView section={dashboard.sections.workItems} label="work items">
          {() => (
            <MyWorkTable
              credentialId={credentialId}
              projectId={projectId}
              dashboardToken={dashboard.generatedAt}
              triage={triage}
              time={linkedTime.connection ? { connection: linkedTime.connection, onPropose: (input) => review.propose(input), isProposing: review.isProposing } : undefined}
            />
          )}
        </SectionView>
      </SectionCard>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 [&>*]:min-w-0">
        <SectionCard title="Pull requests & reviews">
          <SectionView section={dashboard.sections.pullRequests} label="pull requests">
            {() => (
              <PullRequestList scope="mine" credentialId={credentialId} projectId={projectId} dashboardToken={dashboard.generatedAt} triage={triage} />
            )}
          </SectionView>
        </SectionCard>

        <SectionCard title="My recent pipeline runs" description="Latest run per pipeline and branch, last 7 days.">
          <SectionView section={dashboard.sections.pipelines} label="pipelines">
            {() => (
              <PipelineRunList credentialId={credentialId} projectId={projectId} dashboardToken={dashboard.generatedAt} triage={triage} />
            )}
          </SectionView>
        </SectionCard>
      </div>

      <ScopesCard credentialId={credentialId} />

      <ActionReviewDialog action={review.reviewing} onClose={review.closeReview} />
      <ErrorToast
        message={review.proposeError ?? triage.saveError}
        onDismiss={() => {
          review.clearProposeError();
          triage.clearSaveError();
        }}
      />
    </div>
  );
}
