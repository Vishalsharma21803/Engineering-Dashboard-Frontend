import { Link, Navigate, useParams } from "react-router-dom";

import { ActiveIndicator } from "@/components/ui/active-indicator";
import { Button } from "@/components/ui/button";
import { buttonClassName } from "@/components/ui/button-styles";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUrlTab } from "@/hooks/use-url-tab";
import { ActionReviewDialog } from "@/features/azure-devops/components/action-review-dialog";
import { EmptyState, ErrorCard, ErrorToast, SkeletonRows, StaleDataBanner } from "@/features/azure-devops/components/feedback";
import { useActionReview } from "@/features/azure-devops/hooks/use-action-review";
import { useActions } from "@/features/azure-devops/hooks/use-actions";
import { DraftTab } from "../components/draft-tab";
import { ManageTab } from "../components/manage-tab";
import { ProjectMapping } from "../components/project-mapping";
import { ReportsTab } from "../components/reports-tab";
import { TimerBar } from "../components/timer-bar";
import { TimesheetTab } from "../components/timesheet-tab";
import { UnlinkedTab } from "../components/unlinked-tab";
import { VerifyTab } from "../components/verify-tab";
import { useSolidtimeConnections, useSolidtimeProfile } from "../hooks/use-solidtime";
import { localDay } from "../utils/time";

const TABS = [
  { id: "timesheet", label: "Timesheet" },
  { id: "draft", label: "Draft from Azure" },
  { id: "verify", label: "Compare with Azure" },
  { id: "unlinked", label: "No ticket" },
  { id: "reports", label: "Reports" },
  { id: "manage", label: "Projects & tags" },
] as const;

type Tab = (typeof TABS)[number]["id"];

const isTab = (value: string | null): value is Tab => TABS.some((item) => item.id === value);

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
  const [tab, setTab] = useUrlTab(isTab, "timesheet");
  const connections = useSolidtimeConnections();
  const review = useActionReview();
  const pending = useActions({ status: "PENDING", credentialId });
  const profile = useSolidtimeProfile(credentialId);

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
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Time</h1>
          <p className="mt-1 text-sm font-medium text-slate-700">Solidtime · {connection.organizationName}</p>
          <p className="mt-1 text-sm text-slate-600">Every change to Solidtime is proposed first and runs only after you approve it.</p>
        </div>
        {(pending.data?.total ?? 0) > 0 ? (
          <Link to="/actions?from=time" className={buttonClassName({ size: "sm", variant: "secondary" })}>
            {pending.data?.total} awaiting approval
          </Link>
        ) : pending.error && !pending.data ? (
          <Link to="/actions?from=time" className={buttonClassName({ size: "sm", variant: "secondary" })}>
            Approvals could not be checked
          </Link>
        ) : null}
      </div>

      <TimerBar {...props} />

      <Tabs value={tab} onValueChange={(value) => isTab(value) && setTab(value)} className="gap-6">
        <TabsList variant="line" aria-label="Time sections" className="-mx-4 px-4 sm:mx-0 sm:px-0">
          <ActiveIndicator variant="underline" />
          {TABS.map((item) => (
            <TabsTrigger key={item.id} value={item.id}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* The tabs start from "today", so they wait for the time zone it is counted in. */}
        <TabsContent value={tab} className="flex flex-col gap-4">
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
                {tab === "verify" ? <VerifyTab {...props} /> : null}
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
        </TabsContent>
      </Tabs>

      <ActionReviewDialog action={review.reviewing} onClose={review.closeReview} />
      <ErrorToast message={review.proposeError} onDismiss={review.clearProposeError} />
    </section>
  );
}
