import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { Pagination } from "@/components/ui/pagination";
import { Updating } from "@/components/ui/updating";
import { usePageParam, useSyncServedPage } from "@/hooks/use-page-param";
import { cn } from "@/utils/cn";
import { getTicketTimes } from "@/features/solidtime/api/solidtime.api";
import { solidtimeKeys } from "@/features/solidtime/api/solidtime.keys";
import { TicketTimerButton } from "@/features/solidtime/components/ticket-timer-button";
import type { SolidtimeConnection } from "@/features/solidtime/types/solidtime.types";
import { formatDuration } from "@/features/solidtime/utils/time";
import type { ProposeActionInput } from "../types/action.types";
import { getMyWorkPage, getTeamWorkPage } from "../api/azure.api";
import { azureKeys } from "../api/azure.keys";
import type { DashboardTriage } from "../hooks/use-triage";
import type { ComplianceAiReview, ComplianceResult, WorkItemListFilters, WorkItemSummary } from "../types/azure.types";
import { formatRelative } from "../utils/format";
import { SEVERITY_TONES } from "../utils/labels";
import { retryUnlessClientError } from "../utils/query-retry";
import { UNTRIAGED, workItemKey } from "../utils/triage";
import { workItemTypeStyle } from "../utils/work-item-types";
import { EmptyState, ErrorCard, SkeletonRows, StaleDataBanner } from "./feedback";
import { FilterBar, type FilterDefinition } from "./filter-bar";
import { StatusBadge } from "./status-badge";
import { HiddenToggle, TriageBadge, TriageMenu } from "./triage-menu";
import { PriorityBadge, WorkItemStateBadge, WorkItemTypeBadge } from "./work-item-badges";

const EMPTY_WORK_ITEM_FILTERS: WorkItemListFilters = {
  search: "",
  type: "",
  stateCategory: "",
  priority: "",
  sop: "",
  assignee: "",
};

const SEARCH_DELAY_MS = 300;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/** The saved AI review of the ticket (made when it was opened; the list never calls the AI). */
function AiReviewBadge({ review, cleared }: { review: ComplianceAiReview | null; cleared: number }) {
  if (!review) {
    return null;
  }

  if (review.status === "QUEUED" || review.status === "RUNNING") {
    return (
      <StatusBadge tone="info" title="The AI is reviewing this ticket">
        AI reviewing
      </StatusBadge>
    );
  }

  if (review.status === "FAILED" || review.status === "SKIPPED") {
    return (
      <StatusBadge tone="neutral" title="The last AI review did not finish. Open the ticket to see why.">
        AI ✕
      </StatusBadge>
    );
  }

  const when = review.checkedAt ? `checked ${formatRelative(review.checkedAt)}` : "checked";

  return review.outdated ? (
    <StatusBadge tone="neutral" dot={false} title={`AI review ${when}; the ticket changed since, so it may be outdated. Open the ticket to review it again.`}>
      AI may be outdated
    </StatusBadge>
  ) : (
    <StatusBadge tone="neutral" dot={false} title={`AI review ${when}${cleared ? `; it cleared ${cleared} code finding${cleared === 1 ? "" : "s"}` : ""}.`}>
      AI ✓{cleared ? ` ${cleared} cleared` : ""}
    </StatusBadge>
  );
}

/** Items still needed in the ticket's current stage: not gaps yet. */
function TodoBadge({ result }: { result: ComplianceResult }) {
  return result.todos.length > 0 ? (
    <StatusBadge tone="neutral" dot={false} title={`To do in this stage: ${result.todos.map((todo) => `${todo.ruleId} ${todo.ruleTitle}`).join("; ")}`}>
      {result.todos.length} to do
    </StatusBadge>
  ) : null;
}

export function ComplianceBadges({ result }: { result: ComplianceResult | undefined }) {
  if (!result) {
    return <span className="text-xs text-slate-400">—</span>;
  }

  if (!result.configured) {
    return (
      <StatusBadge
        tone="neutral"
        title={
          result.sopProject === "switched-off"
            ? `You switched SOP checks off for ${result.projectName} (SOP rules → Projects).`
            : `${result.projectName} is not set up for SOP checks (SOP rules → Projects).`
        }
      >
        {result.sopProject === "switched-off" ? "SOP off" : "Not set up"}
      </StatusBadge>
    );
  }

  const extras = (
    <>
      <TodoBadge result={result} />
      <AiReviewBadge review={result.aiReview} cleared={result.cleared.length} />
    </>
  );

  if (result.violations.length === 0) {
    const notes = [
      `${result.passedRules.length} ${result.passedRules.length === 1 ? "rule" : "rules"} passed`,
      result.notices.length ? `notices: ${result.notices.map((notice) => notice.ruleId).join(", ")}` : null,
      result.skippedRules.length ? `skipped: ${result.skippedRules.map((rule) => rule.ruleId).join(", ")}` : null,
    ].filter(Boolean);

    return (
      <div className="flex flex-wrap gap-1">
        <StatusBadge tone="success" title={notes.join("; ")}>
          SOP OK
        </StatusBadge>
        {extras}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-1">
      {result.violations.map((violation) => (
        <StatusBadge
          key={`${violation.checker}:${violation.ruleId}`}
          tone={SEVERITY_TONES[violation.severity]}
          title={`${violation.checker === "ai" ? "AI: " : ""}${violation.ruleTitle}: ${violation.message}${violation.phase === "earlier" ? " (missed in an earlier stage)" : ""}`}
        >
          {violation.ruleId}
          {violation.checker === "ai" ? " · AI" : ""}
        </StatusBadge>
      ))}
      {extras}
    </div>
  );
}

interface WorkItemRowsProps {
  credentialId: string;
  rows: Array<{ workItem: WorkItemSummary; compliance: ComplianceResult | null }>;
  /** team: everyone's items in a project, with assignee instead of compliance. */
  team: boolean;
  myId: string | null;
  /** Dashboard snooze / acknowledge / abandon state; omitted for team lists. */
  triage?: DashboardTriage | undefined;
  /** Tracked time and the timer for a row (My work, when Solidtime is linked). */
  timeCell?: ((item: WorkItemSummary) => ReactNode) | undefined;
}

function hours(value: number | null): string {
  return value === null ? "—" : `${value} h`;
}

/** Estimate / done / left, labelled; the estimate falls back to story points or effort. */
function WorkAmounts({ item }: { item: WorkItemSummary }) {
  const points = item.storyPoints ?? item.effort;
  const estimate = item.originalEstimate !== null ? hours(item.originalEstimate) : points !== null ? `${points} pts` : "—";

  return (
    <span className="whitespace-nowrap">
      <span className="text-slate-500">Est</span> {estimate} · <span className="text-slate-500">Done</span> {hours(item.completedWork)} ·{" "}
      <span className="text-slate-500">Left</span> {hours(item.remainingWork)}
    </span>
  );
}

/**
 * One page of tickets. Filtering and paging happen on the server.
 * A table from sm up; below that the same rows stack as cards (one DOM, so links and buttons exist once).
 * Explicit roles keep the table semantics when CSS turns the rows into blocks.
 */
export function WorkItemRows({ credentialId, rows, team, myId, triage, timeCell }: WorkItemRowsProps) {
  return (
    <div className="sm:overflow-x-auto">
      <table role="table" className="block w-full text-left text-sm sm:table sm:min-w-[760px]">
        <thead role="rowgroup" className="hidden border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 sm:table-header-group">
          <tr role="row">
            <th role="columnheader" className="py-2 pl-4 pr-3 font-medium">Work item</th>
            <th role="columnheader" className="px-3 py-2 font-medium">Type</th>
            <th role="columnheader" className="px-3 py-2 font-medium">State</th>
            <th role="columnheader" className="px-3 py-2 font-medium">Pri</th>
            <th role="columnheader" className="px-3 py-2 font-medium" title="Original estimate (or story points), completed and remaining work">
              Work
            </th>
            <th role="columnheader" className="px-3 py-2 font-medium">{team ? "Assigned to" : "SOP compliance"}</th>
            {triage ? (
              <th role="columnheader" className="w-12 px-3 py-2 font-medium">
                <span className="sr-only">Triage</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody role="rowgroup" className="block divide-y divide-slate-100 sm:table-row-group">
          {rows.map(({ workItem: item, compliance }) => {
            const triaged = triage ? triage.resolve(workItemKey(item.id), item.projectName) : UNTRIAGED;

            return (
              <tr
                key={item.id}
                role="row"
                className={cn(
                  "group relative flex flex-wrap items-center gap-x-2 gap-y-2 py-3 pl-4 pr-2 transition hover:bg-slate-50 sm:static sm:table-row sm:p-0 sm:align-top",
                  triaged.state !== "active" && "opacity-75"
                )}
              >
                <td role="cell" className={cn("w-full min-w-0 sm:relative sm:table-cell sm:w-auto sm:py-3 sm:pl-4 sm:pr-3", triage && "pr-10 sm:pr-3")}>
                  <span aria-hidden="true" className={cn("absolute inset-y-2 left-0 w-1 rounded-full", workItemTypeStyle(item.type).bar)} />
                  <Link
                    to={`/azure/${encodeURIComponent(credentialId)}/projects/${encodeURIComponent(item.projectName)}/work-items/${item.id}`}
                    className="break-words font-medium text-slate-950 group-hover:text-indigo-600"
                  >
                    <span className="text-slate-500">#{item.id}</span> {item.title}
                  </Link>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                    {item.projectName}
                    {item.iterationPath ? <span>· {item.iterationPath.split("\\").at(-1)}</span> : null}
                    {item.blocked ? <StatusBadge tone="danger">Blocked</StatusBadge> : null}
                    <TriageBadge resolved={triaged} />
                  </p>
                </td>
                <td role="cell" className="sm:table-cell sm:px-3 sm:py-3">
                  <WorkItemTypeBadge type={item.type} compact />
                </td>
                <td role="cell" className="sm:table-cell sm:px-3 sm:py-3">
                  <WorkItemStateBadge state={item.state} category={item.stateCategory} />
                </td>
                <td role="cell" className="sm:table-cell sm:px-3 sm:py-3">
                  <PriorityBadge priority={item.priority} />
                </td>
                <td role="cell" className="order-last w-full tabular-nums text-slate-700 sm:order-none sm:table-cell sm:w-auto sm:px-3 sm:py-3">
                  <WorkAmounts item={item} />
                  {timeCell ? (
                    <div className="mt-1.5 flex flex-row flex-wrap items-center gap-2 sm:flex-col sm:items-start sm:gap-1">{timeCell(item)}</div>
                  ) : null}
                </td>
                <td role="cell" className="sm:table-cell sm:px-3 sm:py-3">
                  {team ? (
                    item.assignedTo ? (
                      <span className="inline-flex items-center gap-2 text-sm text-slate-700">
                        <span
                          className={cn(
                            "flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                            item.assignedTo.id === myId ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-700"
                          )}
                        >
                          {initials(item.assignedTo.displayName)}
                        </span>
                        {item.assignedTo.id === myId ? "You" : item.assignedTo.displayName}
                      </span>
                    ) : (
                      <span className="text-xs italic text-slate-400">Unassigned</span>
                    )
                  ) : (
                    <ComplianceBadges result={compliance ?? undefined} />
                  )}
                </td>
                {triage ? (
                  <td role="cell" className="absolute right-2 top-2 sm:static sm:table-cell sm:px-3 sm:py-3 sm:text-right">
                    <TriageMenu
                      triage={triage}
                      itemKey={workItemKey(item.id)}
                      projectName={item.projectName}
                      label={`#${item.id} ${item.title}`}
                      resolved={triaged}
                    />
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Filters in the page; the search box waits for typing to pause before asking the server. */
function useListFilters(onChange: () => void) {
  const [filters, setFilters] = useState<WorkItemListFilters>(EMPTY_WORK_ITEM_FILTERS);
  const [searchInput, setSearchInput] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilters((current) => (current.search === searchInput.trim() ? current : { ...current, search: searchInput.trim() }));
    }, SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  return {
    filters,
    searchInput,
    setSearchInput: (value: string) => {
      setSearchInput(value);
      onChange();
    },
    set: (key: keyof WorkItemListFilters) => (value: string) => {
      setFilters((current) => ({ ...current, [key]: value }));
      onChange();
    },
    clear: () => {
      setFilters(EMPTY_WORK_ITEM_FILTERS);
      setSearchInput("");
      onChange();
    },
  };
}

interface MyWorkTableProps {
  credentialId: string;
  projectId: string | undefined;
  /** Changes whenever the dashboard reloads, so the page reloads with it. */
  dashboardToken: string;
  triage: DashboardTriage;
  /** Time tracking on the rows (Solidtime linked to this organization). */
  time?: { connection: SolidtimeConnection; onPropose: (input: ProposeActionInput) => void; isProposing: boolean } | undefined;
}

/** My open tickets, 10 per page, filtered by the server. The page lives in the URL (?page=). */
export function MyWorkTable({ credentialId, projectId, dashboardToken, triage, time }: MyWorkTableProps) {
  const pageParam = usePageParam("page");
  const { page, setPage } = pageParam;
  const [showHidden, setShowHidden] = useState(false);
  const toFirstPage = () => setPage(1, { replace: true });
  const list = useListFilters(toFirstPage);
  // Triage marks change which tickets match, so they refresh the page too.

  const query = useQuery({
    queryKey: [...azureKeys.myWork(credentialId, projectId ?? "all"), { page, showHidden, filters: list.filters, dashboardToken, triage: triage.savedVersion }],
    queryFn: () => getMyWorkPage(credentialId, { projectId, page, hidden: showHidden, filters: list.filters }),
    placeholderData: keepPreviousData,
    retry: retryUnlessClientError,
  });
  useSyncServedPage(pageParam, query.isPlaceholderData ? undefined : query.data?.page);
  const pageIds = (query.data?.items ?? []).map((row) => row.workItem.id);
  const times = useQuery({
    queryKey: [...solidtimeKeys.ticketTimes(time?.connection.credentialId ?? ""), pageIds],
    queryFn: () => getTicketTimes(time?.connection.credentialId ?? "", pageIds),
    enabled: Boolean(time) && pageIds.length > 0,
    retry: retryUnlessClientError,
  });
  const timeById = new Map((times.data ?? []).map((entry) => [entry.ticketId, entry]));

  if (query.isLoading) {
    return <SkeletonRows rows={5} />;
  }

  if (!query.data) {
    return <ErrorCard error={query.error} credentialId={credentialId} onRetry={() => void query.refetch()} />;
  }

  const stale = query.error ? <StaleDataBanner credentialId={credentialId} error={query.error} onRetry={() => void query.refetch()} isRetrying={query.isFetching} /> : null;
  const data = query.data;

  if (data.poolTotal === 0 && data.hiddenCount === 0) {
    return (
      <>
        {stale}
        <EmptyState>No open work items are assigned to you.</EmptyState>
      </>
    );
  }

  const definitions: FilterDefinition[] = [
    { id: "type", label: "Type", value: list.filters.type, options: data.facets.types, onChange: list.set("type") },
    { id: "state", label: "State", value: list.filters.stateCategory, options: data.facets.states, onChange: list.set("stateCategory") },
    { id: "priority", label: "Priority", value: list.filters.priority, options: data.facets.priorities, onChange: list.set("priority") },
    { id: "sop", label: "SOP", value: list.filters.sop, options: data.facets.sop, onChange: list.set("sop") },
  ];

  return (
    <>
      {stale}
      <div className="space-y-3">
        <FilterBar
          search={{ value: list.searchInput, onChange: list.setSearchInput, placeholder: "Search ID, title or tag" }}
          filters={definitions}
          shown={data.total}
          total={data.poolTotal}
          onClear={list.clear}
        />
        {times.error ? (
          <p role="alert" className="text-xs text-amber-700">
            Tracked time could not be loaded from Solidtime.{" "}
            <button type="button" className="font-medium underline" onClick={() => void times.refetch()}>
              Try again
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
          <WorkItemRows
            credentialId={credentialId}
            rows={data.items}
            team={false}
            myId={null}
            triage={triage}
            timeCell={
              time
                ? (item) => (
                    <>
                      <span className="text-xs text-slate-500" title={times.error ? "Tracked time could not be loaded" : "Your time tracked in Solidtime"}>
                        <span aria-hidden="true">⏱</span> {timeById.has(item.id) ? formatDuration(timeById.get(item.id)?.mySeconds ?? 0) : times.error ? "—" : "…"}
                      </span>
                      <TicketTimerButton
                        connection={time.connection}
                        ticket={{ id: item.id, title: item.title, projectName: item.projectName }}
                        onPropose={time.onPropose}
                        disabled={time.isProposing}
                      />
                    </>
                  )
                : undefined
            }
          />
          {data.total === 0 ? (
            <EmptyState className="mt-3">
              {data.poolTotal === 0 && !data.showingHidden ? "All your open work items are snoozed or abandoned." : "No work items match these filters."}
            </EmptyState>
          ) : null}
        </Updating>
        <Pagination
          label="My work pages"
          page={data.page}
          totalPages={data.totalPages}
          total={data.total}
          pageSize={data.pageSize}
          disabled={query.isFetching}
          onChange={(next) => setPage(next)}
        />
      </div>
    </>
  );
}

interface TeamWorkTableProps {
  credentialId: string;
  projectId: string;
  scope: "open" | "all";
  myId: string | null;
}

/** Everyone's tickets in a project, 10 per page, filtered by the server. The page lives in the URL (?page=). */
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
    return <ErrorCard error={query.error} credentialId={credentialId} onRetry={() => void query.refetch()} />;
  }

  const stale = query.error ? <StaleDataBanner credentialId={credentialId} error={query.error} onRetry={() => void query.refetch()} isRetrying={query.isFetching} /> : null;
  const data = query.data;

  if (data.poolTotal === 0) {
    return (
      <>
        {stale}
        <EmptyState>No work items in this project match.</EmptyState>
      </>
    );
  }

  const definitions: FilterDefinition[] = [
    { id: "type", label: "Type", value: list.filters.type, options: data.facets.types, onChange: list.set("type") },
    { id: "state", label: "State", value: list.filters.stateCategory, options: data.facets.states, onChange: list.set("stateCategory") },
    { id: "priority", label: "Priority", value: list.filters.priority, options: data.facets.priorities, onChange: list.set("priority") },
    { id: "assignee", label: "Assignee", value: list.filters.assignee, options: data.facets.assignees, onChange: list.set("assignee") },
  ];

  return (
    <>
      {stale}
      <div className="space-y-3">
        <FilterBar
          search={{ value: list.searchInput, onChange: list.setSearchInput, placeholder: "Search ID, title or tag" }}
          filters={definitions}
          shown={data.total}
          total={data.poolTotal}
          onClear={list.clear}
        />
        <Updating active={query.isPlaceholderData}>
          <WorkItemRows credentialId={credentialId} rows={data.items.map((workItem) => ({ workItem, compliance: null }))} team myId={myId} />
          {data.total === 0 ? <EmptyState className="mt-3">No work items match these filters.</EmptyState> : null}
        </Updating>
        <Pagination
          label="Team work item pages"
          page={data.page}
          totalPages={data.totalPages}
          total={data.total}
          pageSize={data.pageSize}
          disabled={query.isFetching}
          onChange={(next) => setPage(next)}
        />
      </div>
    </>
  );
}
