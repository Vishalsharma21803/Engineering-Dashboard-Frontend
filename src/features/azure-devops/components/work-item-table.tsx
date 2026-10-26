import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { Pagination } from "@/components/ui/pagination";
import { isAiCheckBusy, isAiCheckPaused } from "@/features/sop/hooks/use-sop-ai";
import type { AiCheck } from "@/features/sop/types/sop.types";
import { describeAiCheckReason, describeAiPause } from "@/features/sop/utils/ai-check";
import { usePageParam, useSyncServedPage } from "@/hooks/use-page-param";
import { cn } from "@/utils/cn";
import { getMyWorkPage, getTeamWorkPage } from "../api/azure.api";
import { azureKeys } from "../api/azure.keys";
import type { DashboardTriage } from "../hooks/use-triage";
import type { ComplianceResult, WorkItemListFilters, WorkItemSummary } from "../types/azure.types";
import { formatValue } from "../utils/format";
import { SEVERITY_TONES } from "../utils/labels";
import { retryUnlessClientError } from "../utils/query-retry";
import { UNTRIAGED, workItemKey } from "../utils/triage";
import { workItemTypeStyle } from "../utils/work-item-types";
import { EmptyState, ErrorCard, SkeletonRows } from "./feedback";
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

function AiStatusBadge({ check }: { check: AiCheck | undefined }) {
  if (check && isAiCheckPaused(check)) {
    return (
      <StatusBadge tone="warning" title={`${describeAiPause(check)}${check.errorDetail ? ` Provider said: ${check.errorDetail}` : ""}`}>
        AI paused
      </StatusBadge>
    );
  }

  if (isAiCheckBusy(check)) {
    return (
      <StatusBadge tone="info" title="AI check running">
        AI…
      </StatusBadge>
    );
  }

  if (check?.status === "FAILED" || check?.status === "SKIPPED") {
    return (
      <StatusBadge tone="neutral" title={`AI check: ${describeAiCheckReason(check.errorReason)}`}>
        AI ✕
      </StatusBadge>
    );
  }

  return null;
}

export function ComplianceBadges({ result, ai }: { result: ComplianceResult | undefined; ai?: AiCheck | undefined }) {
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

  if (result.violations.length === 0) {
    const notes = [
      `${result.passedRules.length} rule(s) passed`,
      result.notices.length ? `notices: ${result.notices.map((notice) => notice.ruleId).join(", ")}` : null,
      result.pendingRules.length ? `${result.pendingRules.length} still open` : null,
      result.skippedRules.length ? `skipped: ${result.skippedRules.map((rule) => rule.ruleId).join(", ")}` : null,
    ].filter(Boolean);

    return (
      <div className="flex flex-wrap gap-1">
        <StatusBadge tone="success" title={notes.join("; ")}>
          SOP OK
        </StatusBadge>
        <AiStatusBadge check={ai} />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-1">
      {result.violations.map((violation) => (
        <StatusBadge
          key={`${violation.checker}:${violation.ruleId}`}
          tone={SEVERITY_TONES[violation.severity]}
          title={`${violation.checker === "ai" ? "AI: " : ""}${violation.ruleTitle}: ${violation.message}`}
        >
          {violation.ruleId}
          {violation.checker === "ai" ? " · AI" : ""}
        </StatusBadge>
      ))}
      <AiStatusBadge check={ai} />
    </div>
  );
}

interface WorkItemRowsProps {
  credentialId: string;
  rows: Array<{ workItem: WorkItemSummary; compliance: ComplianceResult | null }>;
  /** team: everyone's items in a project, with assignee instead of compliance. */
  team: boolean;
  myId: string | null;
  aiChecks?: Map<number, AiCheck> | undefined;
  /** Dashboard snooze / acknowledge / abandon state; omitted for team lists. */
  triage?: DashboardTriage | undefined;
}

/** One page of tickets. Filtering and paging happen on the server. */
export function WorkItemRows({ credentialId, rows, team, myId, aiChecks, triage }: WorkItemRowsProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="py-2 pl-4 pr-3 font-medium">Work item</th>
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium">State</th>
            <th className="px-3 py-2 font-medium">Pri</th>
            <th className="px-3 py-2 font-medium" title="Estimate / completed / remaining">
              Est · Done · Left
            </th>
            <th className="px-3 py-2 font-medium">{team ? "Assigned to" : "SOP compliance"}</th>
            {triage ? (
              <th className="w-12 px-3 py-2 font-medium">
                <span className="sr-only">Triage</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map(({ workItem: item, compliance }) => {
            const triaged = triage ? triage.resolve(workItemKey(item.id), item.projectName) : UNTRIAGED;

            return (
              <tr key={item.id} className={cn("group align-top transition hover:bg-slate-50", triaged.state !== "active" && "opacity-75")}>
                <td className="relative py-3 pl-4 pr-3">
                  <span aria-hidden="true" className={cn("absolute inset-y-2 left-0 w-1 rounded-full", workItemTypeStyle(item.type).bar)} />
                  <Link
                    to={`/azure/${encodeURIComponent(credentialId)}/projects/${encodeURIComponent(item.projectName)}/work-items/${item.id}`}
                    className="font-medium text-slate-950 group-hover:text-indigo-600"
                  >
                    <span className="text-slate-500">#{item.id}</span> {item.title}
                  </Link>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                    {item.projectName}
                    {item.iterationPath ? <span>· {item.iterationPath.split("\\").at(-1)}</span> : null}
                    {item.blocked ? <StatusBadge tone="danger">Blocked</StatusBadge> : null}
                    <TriageBadge resolved={triaged} />
                  </p>
                </td>
                <td className="px-3 py-3">
                  <WorkItemTypeBadge type={item.type} compact />
                </td>
                <td className="px-3 py-3">
                  <WorkItemStateBadge state={item.state} category={item.stateCategory} />
                </td>
                <td className="px-3 py-3">
                  <PriorityBadge priority={item.priority} />
                </td>
                <td className="whitespace-nowrap px-3 py-3 tabular-nums text-slate-700">
                  {formatValue(item.originalEstimate ?? item.storyPoints ?? item.effort)} · {formatValue(item.completedWork)} ·{" "}
                  {formatValue(item.remainingWork)}
                </td>
                <td className="px-3 py-3">
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
                    <ComplianceBadges result={compliance ?? undefined} ai={aiChecks?.get(item.id)} />
                  )}
                </td>
                {triage ? (
                  <td className="px-3 py-3 text-right">
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
  aiChecks: Map<number, AiCheck>;
  triage: DashboardTriage;
}

/** My open tickets, 10 per page, filtered by the server. The page lives in the URL (?page=). */
export function MyWorkTable({ credentialId, projectId, dashboardToken, aiChecks, triage }: MyWorkTableProps) {
  const pageParam = usePageParam("page");
  const { page, setPage } = pageParam;
  const [showHidden, setShowHidden] = useState(false);
  const toFirstPage = () => setPage(1, { replace: true });
  const list = useListFilters(toFirstPage);
  // New AI verdicts and triage marks change which tickets match, so they refresh the page too.
  const aiToken = [...aiChecks.values()].map((check) => `${check.workItemId}:${check.updatedAt}`).join(",");

  const query = useQuery({
    queryKey: [...azureKeys.myWork(credentialId, projectId ?? "all"), { page, showHidden, filters: list.filters, dashboardToken, aiToken, triage: triage.version }],
    queryFn: () => getMyWorkPage(credentialId, { projectId, page, hidden: showHidden, filters: list.filters }),
    placeholderData: keepPreviousData,
    retry: retryUnlessClientError,
  });
  useSyncServedPage(pageParam, query.isPlaceholderData ? undefined : query.data?.page);

  if (query.isLoading) {
    return <SkeletonRows rows={5} />;
  }

  if (query.error || !query.data) {
    return <ErrorCard error={query.error} credentialId={credentialId} onRetry={() => void query.refetch()} />;
  }

  const data = query.data;

  if (data.poolTotal === 0 && data.hiddenCount === 0) {
    return <EmptyState>No open work items are assigned to you.</EmptyState>;
  }

  const definitions: FilterDefinition[] = [
    { id: "type", label: "Type", value: list.filters.type, options: data.facets.types, onChange: list.set("type") },
    { id: "state", label: "State", value: list.filters.stateCategory, options: data.facets.states, onChange: list.set("stateCategory") },
    { id: "priority", label: "Priority", value: list.filters.priority, options: data.facets.priorities, onChange: list.set("priority") },
    { id: "sop", label: "SOP", value: list.filters.sop, options: data.facets.sop, onChange: list.set("sop") },
  ];

  return (
    <div className="space-y-3">
      <FilterBar
        search={{ value: list.searchInput, onChange: list.setSearchInput, placeholder: "Search ID, title or tag" }}
        filters={definitions}
        shown={data.total}
        total={data.poolTotal}
        onClear={list.clear}
      />
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
      <WorkItemRows credentialId={credentialId} rows={data.items} team={false} myId={null} aiChecks={aiChecks} triage={triage} />
      {data.total === 0 ? (
        <EmptyState className="mt-3">
          {data.poolTotal === 0 && !data.showingHidden ? "All your open work items are snoozed or abandoned." : "No work items match these filters."}
        </EmptyState>
      ) : null}
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

  if (query.error || !query.data) {
    return <ErrorCard error={query.error} credentialId={credentialId} onRetry={() => void query.refetch()} />;
  }

  const data = query.data;

  if (data.poolTotal === 0) {
    return <EmptyState>No work items in this project match.</EmptyState>;
  }

  const definitions: FilterDefinition[] = [
    { id: "type", label: "Type", value: list.filters.type, options: data.facets.types, onChange: list.set("type") },
    { id: "state", label: "State", value: list.filters.stateCategory, options: data.facets.states, onChange: list.set("stateCategory") },
    { id: "priority", label: "Priority", value: list.filters.priority, options: data.facets.priorities, onChange: list.set("priority") },
    { id: "assignee", label: "Assignee", value: list.filters.assignee, options: data.facets.assignees, onChange: list.set("assignee") },
  ];

  return (
    <div className="space-y-3">
      <FilterBar
        search={{ value: list.searchInput, onChange: list.setSearchInput, placeholder: "Search ID, title or tag" }}
        filters={definitions}
        shown={data.total}
        total={data.poolTotal}
        onClear={list.clear}
      />
      <WorkItemRows credentialId={credentialId} rows={data.items.map((workItem) => ({ workItem, compliance: null }))} team myId={myId} />
      {data.total === 0 ? <EmptyState className="mt-3">No work items match these filters.</EmptyState> : null}
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
  );
}
