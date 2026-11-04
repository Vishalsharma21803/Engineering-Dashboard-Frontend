import { useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { useLinkedSolidtime } from "@/features/solidtime/hooks/use-solidtime";
import { ActionReviewDialog } from "../components/action-review-dialog";
import { ErrorCard, ErrorToast, SectionCard, SectionView, SkeletonRows, StaleDataBanner } from "../components/feedback";
import { GettingStarted } from "../components/getting-started";
import { SprintOverview } from "../components/sprint-overview";
import { PipelineRunList } from "../components/pipeline-run-list";
import { PullRequestList } from "../components/pull-request-list";
import { NotificationsMenu } from "../components/notifications-menu";
import { MyWorkTable } from "../components/work-item-table";
import { useLastVisit } from "../hooks/use-last-visit";
import { useActionReview } from "../hooks/use-action-review";
import { useDashboard } from "../hooks/use-dashboard";
import { useDashboardTriage } from "../hooks/use-triage";
import type { Dashboard, MyWorkOverview } from "../types/azure.types";
import { formatDateTime } from "../utils/format";

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

/** Scrolls to an element; when it is not on screen (e.g. that section starts on another page), to `fallback`. */
const scrollTo = (id: string, fallback?: string) =>
  (document.getElementById(id) ?? (fallback ? document.getElementById(fallback) : null))?.scrollIntoView({ behavior: "smooth", block: "start" });

/** Keyed on the organization: its remembered view, filters and "new since" baseline never carry over to another. */
export function DashboardPage() {
  const { credentialId = "" } = useParams();
  return <OrganizationDashboard key={credentialId} credentialId={credentialId} />;
}

function OrganizationDashboard({ credentialId }: { credentialId: string }) {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("project") ?? undefined;
  const { data: dashboard, isLoading, error, refetch, refresh, isRefreshing } = useDashboard(credentialId, projectId);
  const review = useActionReview();
  const triage = useDashboardTriage(credentialId, dashboard);
  const linkedTime = useLinkedSolidtime(credentialId);
  const lastVisit = useLastVisit(credentialId);
  // The sprint and counts of my list (before filters), for the header above it: undefined while loading, null when My work failed.
  const [listOverview, setListOverview] = useState<{ overview: MyWorkOverview; sprintMode: "current" | "all" } | null | undefined>(undefined);

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

  const names = projectNames(dashboard);

  return (
    <div className="flex flex-col gap-6">
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

      <SprintOverview
        overview={listOverview?.overview ?? null}
        sprintMode={listOverview?.sprintMode ?? null}
        hoursPerDay={linkedTime.connection?.dailyTargetHours ?? 8}
        hoursPerDayIsDefault={!linkedTime.connection}
        generatedAt={dashboard.generatedAt}
        onRefresh={() => void refresh()}
        isRefreshing={isRefreshing}
        unavailable={listOverview === null || dashboard.sections.workItems.status !== "ok"}
        onSection={(section) => scrollTo(`section-${section}`, "my-work")}
        notifications={
          <NotificationsMenu
            credentialId={credentialId}
            // By name, as the dashboard resolved it (the URL may hold the project's id or name).
            projectName={dashboard.projectName ?? undefined}
            dashboardToken={dashboard.generatedAt}
            onPipelines={() => scrollTo("pipelines")}
          />
        }
      />

      <GettingStarted />

      <SectionCard
        id="my-work"
        title="My work"
        help="Your tickets by status (in progress, to do, resolved), each under its user story, the most recent change first. A story assigned to someone else shows their name. A warning on a row says what is missing; Fix… proposes the change for your approval. Press J or K to move between tickets, ⌘K to find one."
      >
        <SectionView section={dashboard.sections.workItems} label="work items">
          {() => (
            <MyWorkTable
              credentialId={credentialId}
              projectId={projectId}
              dashboardToken={dashboard.generatedAt}
              triage={triage}
              myId={dashboard.identity.id}
              fix={{ onPropose: (input) => review.propose(input), isProposing: review.isProposing }}
              lastVisit={lastVisit}
              pullRequests={dashboard.sections.pullRequests.data ?? []}
              onOverview={setListOverview}
              multipleProjects={new Set((dashboard.sections.workItems.data ?? []).map((item) => item.projectName)).size > 1}
              time={linkedTime.connection ? { connection: linkedTime.connection, onPropose: (input) => review.propose(input), isProposing: review.isProposing } : undefined}
            />
          )}
        </SectionView>
      </SectionCard>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 [&>*]:min-w-0">
        <SectionCard id="pull-requests" title="Pull requests" help="Pull requests you authored or are reviewing.">
          <SectionView section={dashboard.sections.pullRequests} label="pull requests">
            {() => (
              <PullRequestList scope="mine" credentialId={credentialId} projectId={projectId} dashboardToken={dashboard.generatedAt} triage={triage} />
            )}
          </SectionView>
        </SectionCard>

        <SectionCard id="pipelines" title="Pipeline runs" help="The latest run of each pipeline and branch you triggered in the last 7 days.">
          <SectionView section={dashboard.sections.pipelines} label="pipelines">
            {() => (
              <PipelineRunList credentialId={credentialId} projectId={projectId} dashboardToken={dashboard.generatedAt} triage={triage} />
            )}
          </SectionView>
        </SectionCard>
      </div>

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
