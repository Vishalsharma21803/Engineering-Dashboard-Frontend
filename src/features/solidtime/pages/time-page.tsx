import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { buttonClassName } from "@/components/ui/button-styles";
import { ActionReviewDialog } from "@/features/azure-devops/components/action-review-dialog";
import { EmptyState, ErrorCard, ErrorToast, SkeletonRows, StaleDataBanner } from "@/features/azure-devops/components/feedback";
import { useActionReview } from "@/features/azure-devops/hooks/use-action-review";
import { useActions } from "@/features/azure-devops/hooks/use-actions";
import { cn } from "@/utils/cn";
import { DraftTab } from "../components/draft-tab";
import { ManageTab } from "../components/manage-tab";
import { ProjectMapping } from "../components/project-mapping";
import { ReportsTab } from "../components/reports-tab";
import { TicketTimeLookup } from "../components/ticket-time-lookup";
import { TimerBar } from "../components/timer-bar";
import { TimesheetTab } from "../components/timesheet-tab";
import { UnlinkedTab } from "../components/unlinked-tab";
import { useSolidtimeConnections, useSolidtimeProfile } from "../hooks/use-solidtime";
import { localDay } from "../utils/time";

const TABS = [
  { id: "timesheet", label: "Timesheet" },
  { id: "draft", label: "Draft from Azure" },
  { id: "unlinked", label: "No ticket" },
  { id: "reports", label: "Reports" },
  { id: "manage", label: "Projects & tags" },
] as const;

type Tab = (typeof TABS)[number]["id"];

/** /time: opens the first Solidtime connection, or explains how to add one. */
export function TimeIndexPage() {
  const connections = useSolidtimeConnections();

  if (connections.isLoading) return <SkeletonRows rows={3} />;
  if (!connections.data) return <ErrorCard error={connections.error} onRetry={() => void connections.refetch()} isRetrying={connections.isFetching} />;

  const ready = connections.data.find((connection) => connection.organizationId !== null);

  if (ready) {
    return <Navigate to={`/time/${encodeURIComponent(ready.credentialId)}`} replace />;
  }

  return (
    <div className="flex flex-col gap-3">
      {connections.error ? <StaleDataBanner error={connections.error} onRetry={() => void connections.refetch()} isRetrying={connections.isFetching} /> : null}
      <EmptyState>
        Connect Solidtime (and choose its organization) to track time here.{" "}
        <Link to="/credentials" className="font-medium text-indigo-700 hover:underline">
          Credentials
        </Link>
      </EmptyState>
    </div>
  );
}

/** Time tracking with Solidtime: every change is proposed and runs only after approval. */
export function TimePage() {
  const { credentialId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const connections = useSolidtimeConnections();
  const review = useActionReview();
  const pending = useActions({ status: "PENDING", credentialId });
  const profile = useSolidtimeProfile(credentialId);
  const requested = searchParams.get("tab");
  const tab: Tab = TABS.some((item) => item.id === requested) ? (requested as Tab) : "timesheet";

  if (connections.isLoading) return <SkeletonRows rows={4} />;
  if (!connections.data) return <ErrorCard error={connections.error} onRetry={() => void connections.refetch()} isRetrying={connections.isFetching} />;

  const connection = connections.data.find((item) => item.credentialId === credentialId);

  if (!connection || !connection.organizationId) {
    return (
      <EmptyState>
        This Solidtime connection was not found or has no organization chosen.{" "}
        <Link to="/credentials" className="font-medium text-indigo-700 hover:underline">
          Credentials
        </Link>
      </EmptyState>
    );
  }

  // "Today" is counted in my Solidtime time zone, like on the server. Without
  // the profile, the browser's zone is used (and said so below).
  const timeZone = profile.data?.timeZone ?? null;
  const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const props = { connection, onPropose: review.propose, isProposing: review.isProposing, today: localDay(undefined, timeZone) };

  return (
    <section className="flex w-full flex-col gap-6">
      {connections.error ? <StaleDataBanner error={connections.error} onRetry={() => void connections.refetch()} isRetrying={connections.isFetching} /> : null}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">Solidtime · {connection.organizationName}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Time</h1>
          <p className="mt-1 text-sm text-slate-600">Every change to Solidtime is proposed first and runs only after you approve it.</p>
        </div>
        {(pending.data?.total ?? 0) > 0 ? (
          <Link to="/actions" className={buttonClassName({ size: "sm", variant: "secondary" })}>
            {pending.data?.total} awaiting approval
          </Link>
        ) : null}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <TimerBar {...props} />
        <TicketTimeLookup connection={connection} onPropose={review.propose} isProposing={review.isProposing} />
      </div>

      <div role="tablist" aria-label="Time sections" className="-mx-4 flex gap-1 overflow-x-auto border-b border-slate-200 px-4 sm:mx-0 sm:px-0">
        {TABS.map((item) => (
          <button
            key={item.id}
            id={`time-tab-${item.id}`}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            aria-controls="time-panel"
            onClick={() => setSearchParams(item.id === "timesheet" ? {} : { tab: item.id })}
            className={cn("-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium", tab === item.id ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-600 hover:text-slate-900")}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* The tabs start from "today", so they wait for the time zone it is counted in. */}
      <div id="time-panel" role="tabpanel" aria-labelledby={`time-tab-${tab}`} className="flex flex-col gap-4">
        {profile.isLoading ? (
          <SkeletonRows rows={4} />
        ) : (
          <>
            {profile.isError && !profile.data ? (
              <p role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
                Your Solidtime time zone could not be loaded, so days follow this browser's time zone ({browserTimeZone}).
                <Button size="sm" variant="ghost" disabled={profile.isFetching} onClick={() => void profile.refetch()}>
                  {profile.isFetching ? "Retrying..." : "Retry"}
                </Button>
              </p>
            ) : null}
            {/* Keyed on the zone: once it loads (after a retry), the tabs start again from the right "today". */}
            <div key={timeZone ?? "browser"}>
              {tab === "timesheet" ? <TimesheetTab {...props} /> : null}
              {tab === "draft" ? <DraftTab {...props} /> : null}
              {tab === "unlinked" ? <UnlinkedTab {...props} /> : null}
              {tab === "reports" ? <ReportsTab connection={connection} today={props.today} /> : null}
              {tab === "manage" ? (
                <div className="flex flex-col gap-6">
                  <ProjectMapping connection={connection} />
                  <ManageTab {...props} />
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>

      <ActionReviewDialog action={review.reviewing} onClose={review.closeReview} />
      <ErrorToast message={review.proposeError} onDismiss={review.clearProposeError} />
    </section>
  );
}
