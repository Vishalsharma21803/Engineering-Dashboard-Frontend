import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";

import { buttonClassName } from "@/components/ui/button-styles";
import { ActionReviewDialog } from "@/features/azure-devops/components/action-review-dialog";
import { EmptyState, ErrorCard, ErrorToast, SkeletonRows } from "@/features/azure-devops/components/feedback";
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
import { useSolidtimeConnections, useSolidtimeTimeZone } from "../hooks/use-solidtime";
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
  if (connections.error) return <ErrorCard error={connections.error} onRetry={() => void connections.refetch()} />;

  const ready = (connections.data ?? []).find((connection) => connection.organizationId !== null);

  if (ready) {
    return <Navigate to={`/time/${encodeURIComponent(ready.credentialId)}`} replace />;
  }

  return (
    <EmptyState>
      Connect Solidtime (and choose its organization) to track time here.{" "}
      <Link to="/credentials" className="font-medium text-indigo-700 hover:underline">
        Credentials
      </Link>
    </EmptyState>
  );
}

/** Time tracking with Solidtime: every change is proposed and runs only after approval. */
export function TimePage() {
  const { credentialId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const connections = useSolidtimeConnections();
  const review = useActionReview();
  const pending = useActions({ status: "PENDING", credentialId });
  const timeZone = useSolidtimeTimeZone(credentialId);
  const requested = searchParams.get("tab");
  const tab: Tab = TABS.some((item) => item.id === requested) ? (requested as Tab) : "timesheet";

  if (connections.isLoading) return <SkeletonRows rows={4} />;
  if (connections.error) return <ErrorCard error={connections.error} onRetry={() => void connections.refetch()} />;

  const connection = (connections.data ?? []).find((item) => item.credentialId === credentialId);

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

  // "Today" is counted in my Solidtime time zone, like on the server.
  const props = { connection, onPropose: review.propose, isProposing: review.isProposing, today: localDay(undefined, timeZone) };

  return (
    <section className="flex w-full flex-col gap-5">
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

      <TimerBar {...props} />

      <TicketTimeLookup connection={connection} onPropose={review.propose} isProposing={review.isProposing} />

      <div role="tablist" aria-label="Time sections" className="flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((item) => (
          <button
            key={item.id}
            id={`time-tab-${item.id}`}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            aria-controls="time-panel"
            onClick={() => setSearchParams(item.id === "timesheet" ? {} : { tab: item.id })}
            className={cn("-mb-px border-b-2 px-3 py-2 text-sm font-medium", tab === item.id ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-600 hover:text-slate-900")}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div id="time-panel" role="tabpanel" aria-labelledby={`time-tab-${tab}`}>
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

      <ActionReviewDialog action={review.reviewing} onClose={review.closeReview} />
      <ErrorToast message={review.proposeError} onDismiss={review.clearProposeError} />
    </section>
  );
}
