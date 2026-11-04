import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { Pagination } from "@/components/ui/pagination";
import { Segmented } from "@/components/ui/segmented";
import { Updating } from "@/components/ui/updating";
import { usePageParam, useSyncServedPage } from "@/hooks/use-page-param";
import { getTicketTimes } from "@/features/solidtime/api/solidtime.api";
import { solidtimeKeys } from "@/features/solidtime/api/solidtime.keys";
import type { SolidtimeConnection } from "@/features/solidtime/types/solidtime.types";
import type { ProposeActionInput } from "../types/action.types";
import { getMyWorkPage, getTeamWorkPage } from "../api/azure.api";
import { azureKeys } from "../api/azure.keys";
import type { DashboardTriage } from "../hooks/use-triage";
import type { MyWorkOverview, PullRequestSummary } from "../types/azure.types";
import { retryUnlessClientError } from "../utils/query-retry";
import { readStored, writeStored } from "../utils/stored";
import { checkedTicketsTruncatedNotice, listedTicketsTruncatedNotice, sprintUnreadableNotice, stateLookupNotice } from "../utils/read-notices";
import { EmptyState, ErrorCard, PartialReadNotice, SkeletonRows, StaleDataBanner } from "./feedback";
import { HiddenToggle } from "./triage-menu";
import { GroupedTickets } from "./work-list/grouped-tickets";
import { groupProject } from "./work-list/groups";
import { ListToolbar } from "./work-list/list-toolbar";
import type { ListGroup, RowContext } from "./work-list/row-parts";
import { useListFilters } from "./work-list/use-list-filters";

/* ------------------------------------------------------------ My work */

interface MyWorkTableProps {
  credentialId: string;
  projectId: string | undefined;
  /** Changes whenever the dashboard reloads, so the page reloads with it. */
  dashboardToken: string;
  triage: DashboardTriage;
  /** Time tracking on the rows (Solidtime linked to this organization). */
  time?: { connection: SolidtimeConnection; onPropose: (input: ProposeActionInput) => void; isProposing: boolean } | undefined;
  /** Proposes a ticket's fix (opens the approval dialog). */
  fix: { onPropose: (input: ProposeActionInput) => void; isProposing: boolean };
  /** My open pull requests (the dashboard's), for the state shown on linked tickets. */
  pullRequests: PullRequestSummary[];
  lastVisit?: number | null | undefined;
  myId: string | null;
  /** The sprint and counts the list was built from, for the header above it. */
  /** Null when the list could not be loaded. */
  onOverview?: ((data: { overview: MyWorkOverview; sprintMode: "current" | "all" } | null) => void) | undefined;
  /** My tickets span more than one project (All projects selected): each status section splits them by project. */
  multipleProjects?: boolean | undefined;
}

interface ListView {
  sprint: "current" | "all" | undefined;
  closed: boolean;
  /** Only tickets that need something from me. */
  attention?: boolean;
  groupBy?: "status" | "story";
}

/** My tickets in status sections (stories inside), 10 groups per page, newest change first, filtered by the server. The page lives in the URL (?page=). */
export function MyWorkTable({ credentialId, projectId, dashboardToken, triage, time, fix, pullRequests, lastVisit, myId, onOverview, multipleProjects = false }: MyWorkTableProps) {
  const pageParam = usePageParam("page");
  const { page, setPage } = pageParam;
  const [showHidden, setShowHidden] = useState(false);
  const toFirstPage = () => setPage(1, { replace: true });
  const list = useListFilters(toFirstPage, `cockpit:my-work-filters:${credentialId}`);
  const viewKey = `cockpit:my-work-view:${credentialId}`;
  const [view, setViewState] = useState<ListView>(() => readStored<ListView>(viewKey, { sprint: undefined, closed: false }));
  const setView = (next: ListView) => {
    setViewState(next);
    writeStored(viewKey, next);
    toFirstPage();
  };
  const groupBy = view.groupBy ?? "status";

  // Triage marks change which tickets match, so they refresh the page too.
  const query = useQuery({
    queryKey: [...azureKeys.myWork(credentialId, projectId ?? "all"), { page, showHidden, filters: list.filters, view, dashboardToken, triage: triage.savedVersion }],
    queryFn: () => getMyWorkPage(credentialId, { projectId, page, hidden: showHidden, filters: list.filters, sprint: view.sprint, closed: view.closed, attention: view.attention === true, groupBy }),
    placeholderData: keepPreviousData,
    retry: retryUnlessClientError,
  });
  useSyncServedPage(pageParam, query.isPlaceholderData ? undefined : query.data?.page);
  const pageIds = (query.data?.items ?? []).flatMap((group) => [...(group.headingRow ? [group.headingRow] : []), ...group.rows]).map((row) => row.workItem.id);
  const times = useQuery({
    queryKey: [...solidtimeKeys.ticketTimes(time?.connection.credentialId ?? ""), pageIds],
    queryFn: () => getTicketTimes(time?.connection.credentialId ?? "", pageIds),
    enabled: Boolean(time) && pageIds.length > 0,
    retry: retryUnlessClientError,
  });
  // Trying again after a failure starts over without data, which clears the error: keep the line, saying so.
  const timesRetrying = times.isPending && times.isFetching && times.errorUpdateCount > 0;

  const overview = query.data?.overview;
  const sprintMode = query.data?.sprint.mode;
  const failed = !query.data && Boolean(query.error);
  useEffect(() => {
    if (overview && sprintMode) onOverview?.({ overview, sprintMode });
    else if (failed) onOverview?.(null);
  }, [overview, sprintMode, failed, onOverview]);

  if (query.isLoading) {
    return <SkeletonRows rows={5} />;
  }

  if (!query.data) {
    return <ErrorCard error={query.error} credentialId={credentialId} onRetry={() => void query.refetch()} isRetrying={query.isFetching} />;
  }

  const stale = query.error ? <StaleDataBanner credentialId={credentialId} error={query.error} onRetry={() => void query.refetch()} isRetrying={query.isFetching} /> : null;
  const data = query.data;
  const sprintName = data.sprint.names.length === 1 ? data.sprint.names[0]! : "Current sprint";
  const partial = (
    <PartialReadNotice
      className="mb-3"
      messages={[checkedTicketsTruncatedNotice(data.workItemsTruncated), stateLookupNotice(data.stateLookupFailed), sprintUnreadableNotice(data.sprint.unreadable)]}
    />
  );

  if (data.poolTotal === 0 && data.hiddenCount === 0 && data.sprint.mode === "all" && data.closed.count === 0) {
    return (
      <>
        {stale}
        {partial}
        <EmptyState>Nothing is assigned to you in Azure DevOps right now. New tickets assigned to you show up here.</EmptyState>
      </>
    );
  }

  const context: RowContext = {
    credentialId,
    myId,
    team: false,
    triage,
    fix,
    time: time ? { ...time, tracked: new Map((times.data ?? []).map((entry) => [entry.ticketId, entry.mySeconds])) } : undefined,
    pullRequests: new Map(pullRequests.map((pr) => [pr.pullRequestId, pr])),
    isNew: (item) => lastVisit !== null && lastVisit !== undefined && item.changedDate !== null && Date.parse(item.changedDate) > lastVisit,
  };
  const groups: ListGroup[] = data.items.map((group) => ({
    heading: group.heading,
    latest: group.latest,
    section: group.section,
    progress: group.progress,
    headingRow: group.headingRow ? { item: group.headingRow.workItem, compliance: group.headingRow.compliance, attention: group.headingRow.attention } : null,
    rows: group.rows.map((row) => ({ item: row.workItem, compliance: row.compliance, attention: row.attention })),
  }));
  const doneCount = data.sections.find((section) => section.key === "done")?.count ?? 0;

  return (
    <>
      {stale}
      {partial}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label="Show"
            value={data.attention.only ? "attention" : "all"}
            options={[
              { value: "all", label: "All my work" },
              { value: "attention", label: `Needs attention · ${data.attention.count}` },
            ]}
            onChange={(value) => setView({ ...view, attention: value === "attention" })}
          />
          {data.sprint.inSprint > 0 || data.sprint.mode === "current" ? (
            <Segmented
              label="Sprint"
              value={data.sprint.mode}
              options={[
                { value: "current", label: sprintName },
                { value: "all", label: "All sprints" },
              ]}
              onChange={(sprint) => setView({ ...view, sprint })}
            />
          ) : null}
          <div className="flex w-full min-w-0 items-center justify-end sm:w-auto sm:flex-1">
            <ListToolbar
              list={list}
              definitions={[
                { id: "type", label: "Type", options: data.facets.types },
                { id: "stateCategory", label: "State", options: data.facets.states },
                { id: "priority", label: "Priority", options: data.facets.priorities },
                { id: "sop", label: "Checks", options: data.facets.sop },
              ]}
              extra={
                <div className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                  Group by
                  <Segmented
                    label="Group by"
                    value={groupBy}
                    options={[
                      { value: "status", label: "Status" },
                      { value: "story", label: "Story" },
                    ]}
                    onChange={(value) => setView({ ...view, groupBy: value })}
                  />
                </div>
              }
            />
          </div>
        </div>
        {times.error || timesRetrying ? (
          <p role="alert" className="text-xs text-amber-700">
            Tracked time could not be loaded from Solidtime.{" "}
            <button type="button" className="font-medium underline disabled:opacity-60" onClick={() => void times.refetch()} disabled={timesRetrying}>
              {timesRetrying ? "Retrying…" : "Try again"}
            </button>
          </p>
        ) : null}
        {data.hiddenCount > 0 ? (
          <div className="flex justify-end">
            <HiddenToggle
              count={data.hiddenCount}
              shown={data.showingHidden}
              onToggle={() => {
                setShowHidden(!data.showingHidden);
                toFirstPage();
              }}
            />
          </div>
        ) : null}
        <Updating active={query.isPlaceholderData}>
          {data.total > 0 || doneCount > 0 ? (
            <GroupedTickets
              label="My work items"
              groups={groups}
              context={context}
              collapsedKey={`cockpit:collapsed:${credentialId}`}
              byProject={!projectId && (multipleProjects || new Set(groups.map(groupProject)).size > 1)}
              sectionCounts={new Map(data.sections.map((section) => [section.key, section.count]))}
              // The "Done recently" switch sits where done tickets start, or at the very end of the list (last page) when they are folded.
              done={
                !data.showingHidden && (data.page === data.totalPages || groups.some((group) => group.section === "done"))
                  ? { count: doneCount, open: view.closed, onToggle: () => setView({ ...view, closed: !view.closed }) }
                  : undefined
              }
            />
          ) : (
            <EmptyState>
              {data.poolTotal > 0 || data.showingHidden
                ? data.attention.only
                  ? "Nothing needs your attention. Everything assigned to you is on track."
                  : "No tickets match these filters. Clear them in Filter."
                : data.sprint.mode === "current"
                  ? `Nothing of yours is in ${sprintName}. Switch to All sprints to see the rest.`
                  : data.hiddenCount > 0
                    ? "All your open tickets are snoozed or abandoned."
                    : "No open tickets are assigned to you."}
            </EmptyState>
          )}
        </Updating>
        <Pagination
          label="My work pages"
          page={data.page}
          totalPages={data.totalPages}
          total={data.total}
          pageSize={data.pageSize}
          summary={`Page ${data.page} of ${data.totalPages}`}
          disabled={query.isFetching}
          onChange={(next) => setPage(next)}
        />
      </div>
    </>
  );
}

/* ------------------------------------------------------------ Team */

interface TeamWorkTableProps {
  credentialId: string;
  projectId: string;
  scope: "open" | "all";
  myId: string | null;
}

/** Everyone's tickets in a project grouped by story, 10 groups per page, filtered by the server. The page lives in the URL (?page=). */
export function TeamWorkTable({ credentialId, projectId, scope, myId }: TeamWorkTableProps) {
  const pageParam = usePageParam("page");
  const { page, setPage } = pageParam;
  const list = useListFilters(() => setPage(1, { replace: true }));

  const query = useQuery({
    queryKey: [...azureKeys.teamWork(credentialId, projectId), { scope, page, filters: list.filters }],
    queryFn: () => getTeamWorkPage(credentialId, projectId, { scope, page, filters: list.filters }),
    placeholderData: keepPreviousData,
    retry: retryUnlessClientError,
  });
  useSyncServedPage(pageParam, query.isPlaceholderData ? undefined : query.data?.page);

  if (query.isLoading) {
    return <SkeletonRows rows={4} />;
  }

  if (!query.data) {
    return <ErrorCard error={query.error} credentialId={credentialId} onRetry={() => void query.refetch()} isRetrying={query.isFetching} />;
  }

  const stale = query.error ? <StaleDataBanner credentialId={credentialId} error={query.error} onRetry={() => void query.refetch()} isRetrying={query.isFetching} /> : null;
  const data = query.data;
  const partial = <PartialReadNotice className="mb-3" messages={[listedTicketsTruncatedNotice(data.workItemsTruncated)]} />;

  if (data.poolTotal === 0) {
    return (
      <>
        {stale}
        {partial}
        <EmptyState>No work items in this project match.</EmptyState>
      </>
    );
  }

  const context: RowContext = { credentialId, myId, team: true, pullRequests: new Map(), isNew: () => false };
  const groups: ListGroup[] = data.items.map((group) => ({
    heading: group.heading,
    latest: group.latest,
    section: null,
    progress: null,
    headingRow: group.headingRow ? { item: group.headingRow, compliance: null, attention: null } : null,
    rows: group.rows.map((item) => ({ item, compliance: null, attention: null })),
  }));

  return (
    <>
      {stale}
      {partial}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-slate-500" aria-live="polite">
            {data.ticketCount === data.poolTotal ? `${data.poolTotal} tickets` : `${data.ticketCount} of ${data.poolTotal} tickets`}
          </span>
          <ListToolbar
            list={list}
            definitions={[
              { id: "type", label: "Type", options: data.facets.types },
              { id: "stateCategory", label: "State", options: data.facets.states },
              { id: "priority", label: "Priority", options: data.facets.priorities },
              { id: "assignee", label: "Assignee", options: data.facets.assignees },
            ]}
          />
        </div>
        <Updating active={query.isPlaceholderData}>
          {data.total > 0 ? (
            <GroupedTickets label="Team work items" groups={groups} context={context} collapsedKey={`cockpit:team-collapsed:${credentialId}`} />
          ) : (
            <EmptyState>No work items match these filters. Clear them in Filter.</EmptyState>
          )}
        </Updating>
        <Pagination
          label="Team work item pages"
          page={data.page}
          totalPages={data.totalPages}
          total={data.total}
          pageSize={data.pageSize}
          summary={`Page ${data.page} of ${data.totalPages}`}
          disabled={query.isFetching}
          onChange={(next) => setPage(next)}
        />
      </div>
    </>
  );
}
