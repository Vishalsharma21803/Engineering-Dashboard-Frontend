import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Updating } from "@/components/ui/updating";
import { Pagination } from "@/components/ui/pagination";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState, ErrorCard, SectionCard, StatTile } from "@/features/azure-devops/components/feedback";
import { FilterBar } from "@/features/azure-devops/components/filter-bar";
import { StatusBadge } from "@/features/azure-devops/components/status-badge";
import { formatDateTime, formatRelative } from "@/features/azure-devops/utils/format";
import { SEVERITY_TONES } from "@/features/azure-devops/utils/labels";
import { usePageParam, useSearchParamsUpdate, useSyncServedPage } from "@/hooks/use-page-param";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/utils/cn";
import { deleteSopReportRun, getSopReportRun, listSopReportRuns, runSopReport } from "../api/sop.api";
import { sopKeys } from "../api/sop.keys";
import type { SopReport, SopReportFilters, SopReportRole } from "../types/sop.types";

const TABLE = "w-full text-left text-sm";
const HEAD = "bg-slate-50 text-xs uppercase tracking-wide text-slate-500";
const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_FILTERS: SopReportFilters = { person: "", role: "", rule: "", type: "", state: "" };
const ROLE_LABELS: Record<SopReportRole, string> = { tl: "Team lead", qa: "QA", po: "Product owner", developer: "Developer" };

function percent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

interface CardProps {
  credentialId: string;
  projectId: string;
}

/**
 * The team's SOP picture for one project. Each run checks every open and
 * recently closed ticket and is saved for the person who ran it (private,
 * kept until they delete it); runs are filtered and paged on the server.
 */
export function SopReportCard({ credentialId, projectId }: CardProps) {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const updateParams = useSearchParamsUpdate();
  const runsPageParam = usePageParam("runsPage");
  const runs = useQuery({
    queryKey: [...sopKeys.reportRuns(credentialId, projectId), runsPageParam.page],
    queryFn: () => listSopReportRuns(credentialId, projectId, runsPageParam.page),
    placeholderData: keepPreviousData,
  });
  useSyncServedPage(runsPageParam, runs.data && !runs.isPlaceholderData ? runs.data.page : undefined);

  const requested = searchParams.get("report");
  // The run in the URL, or else the newest one.
  const runId = requested && RUN_ID.test(requested) ? requested : (runs.data?.latestId ?? null);

  /** Shows a run (null: the newest) from its first pages; `extra` changes more params in the same navigation. */
  const selectRun = (id: string | null, options: { replace?: boolean; extra?: Record<string, string | null> } = {}) =>
    updateParams({ report: id, reportPage: null, rulePage: null, personPage: null, ...options.extra }, { replace: options.replace ?? false });

  const run = useMutation({
    mutationFn: () => runSopReport(credentialId, projectId),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: sopKeys.reportRuns(credentialId, projectId) });
      // The new run is the newest: show it, with the saved list back on its first page.
      selectRun(created.id, { extra: { runsPage: null } });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteSopReportRun(credentialId, projectId, id),
    onSuccess: async (_result, id) => {
      // Refresh the list first, so the deleted run is never asked for again.
      await queryClient.invalidateQueries({ queryKey: sopKeys.reportRuns(credentialId, projectId) });
      if (id === requested) {
        selectRun(null, { replace: true });
      }
      queryClient.removeQueries({ queryKey: sopKeys.reportRun(credentialId, projectId, id) });
    },
  });
  const [runsOpen, setRunsOpen] = useState(runsPageParam.page > 1);

  const notSetUp = run.error instanceof ApiError && run.error.reason === "SOP_PROJECT_NOT_SET_UP";

  return (
    <SectionCard
      title="Team SOP report"
      description="Every open or recently closed ticket in this project, checked with the default SOP rules (code rules only; AI results stay private to each person). Each run is saved for you only."
      actions={
        <Button size="sm" variant="secondary" className="self-start whitespace-nowrap" disabled={run.isPending} onClick={() => run.mutate()}>
          {run.isPending ? <Spinner className="size-4" /> : null}
          {run.isPending ? "Running…" : "Run report"}
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        {notSetUp ? (
          <p className="text-sm text-slate-600">
            This project is not set up for SOP checks yet.{" "}
            <Link to="/sop-rules?tab=projects" className="font-medium text-indigo-700 hover:underline">
              Set it up
            </Link>
          </p>
        ) : run.error ? (
          <ErrorCard error={run.error} credentialId={credentialId} onRetry={() => run.mutate()} />
        ) : null}
        {run.isPending ? <p className="text-sm text-slate-500">Checking every ticket in the project; this can take a minute.</p> : null}

        {runs.error ? (
          <ErrorCard error={runs.error} credentialId={credentialId} onRetry={() => void runs.refetch()} />
        ) : !runs.data ? (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Spinner className="size-4" /> Loading your saved reports…
          </p>
        ) : runs.data.total === 0 ? (
          <EmptyState>No saved reports yet. Run the report to check the team's tickets; each run is kept until you delete it.</EmptyState>
        ) : (
          <>
            <details open={runsOpen} onToggle={(event) => setRunsOpen(event.currentTarget.open)}>
              <summary className="cursor-pointer text-sm font-medium text-slate-700">Your saved reports ({runs.data.total})</summary>
              <Updating active={runs.isPlaceholderData}>
                <ul aria-label="Saved reports" className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {runs.data.items.map((item) => (
                    <li key={item.id} className={cn("flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm", item.id === runId && "bg-indigo-50/60")}>
                      <span className="text-slate-700">
                        <span className="font-medium text-slate-900">{formatDateTime(item.createdAt)}</span> · {item.itemsChecked} checked ·{" "}
                        {item.itemsWithGaps} with gaps · rules v{item.defaultVersion}
                      </span>
                      <span className="flex gap-2">
                        <Button size="sm" variant="secondary" disabled={item.id === runId} onClick={() => selectRun(item.id)}>
                          {item.id === runId ? "Showing" : "Open"}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={remove.isPending}
                          aria-label={`Delete the report from ${formatDateTime(item.createdAt)}`}
                          onClick={() => {
                            if (window.confirm(`Delete the report from ${formatDateTime(item.createdAt)}? This cannot be undone.`)) {
                              remove.mutate(item.id);
                            }
                          }}
                        >
                          Delete
                        </Button>
                      </span>
                    </li>
                  ))}
                </ul>
                <Pagination
                  label="Saved report pages"
                  page={runs.data.page}
                  totalPages={runs.data.totalPages}
                  total={runs.data.total}
                  pageSize={runs.data.pageSize}
                  disabled={runs.isFetching}
                  onChange={(next) => runsPageParam.setPage(next)}
                />
              </Updating>
            </details>
            {remove.error ? <p role="alert" className="text-sm text-rose-600">Could not delete that report. Please try again.</p> : null}

            {runId ? (
              <ReportRun key={runId} credentialId={credentialId} projectId={projectId} runId={runId} onMissing={() => selectRun(null, { replace: true })} />
            ) : null}
          </>
        )}
      </div>
    </SectionCard>
  );
}

function ReportRun({ credentialId, projectId, runId, onMissing }: CardProps & { runId: string; onMissing: () => void }) {
  const [filters, setFilters] = useState<SopReportFilters>(NO_FILTERS);
  const itemsPage = usePageParam("reportPage");
  const rulePage = usePageParam("rulePage");
  const personPage = usePageParam("personPage");
  const updateParams = useSearchParamsUpdate();
  const [ticketsOpen, setTicketsOpen] = useState(itemsPage.page > 1);
  const report = useQuery({
    queryKey: [...sopKeys.reportRun(credentialId, projectId, runId), { filters, page: itemsPage.page, rulePage: rulePage.page, personPage: personPage.page }],
    queryFn: () => getSopReportRun(credentialId, projectId, runId, { filters, page: itemsPage.page, rulePage: rulePage.page, personPage: personPage.page }),
    placeholderData: keepPreviousData,
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2,
  });
  const served = report.data && !report.isPlaceholderData ? report.data : undefined;
  useSyncServedPage(itemsPage, served?.items.page);
  useSyncServedPage(rulePage, served?.byRule.page);
  useSyncServedPage(personPage, served?.byPerson.page);

  if (report.error instanceof ApiError && report.error.status === 404) {
    return (
      <p className="text-sm text-slate-600">
        That report no longer exists.{" "}
        <button type="button" className="font-medium text-indigo-700 hover:underline" onClick={onMissing}>
          Show your latest report
        </button>
      </p>
    );
  }

  if (report.error || !report.data) {
    return report.error ? (
      <ErrorCard error={report.error} credentialId={credentialId} onRetry={() => void report.refetch()} />
    ) : (
      <p className="flex items-center gap-2 text-sm text-slate-500">
        <Spinner className="size-4" /> Loading the report…
      </p>
    );
  }

  const data: SopReport = report.data;
  const busy = report.isFetching;
  const toFirstPages = () => updateParams({ reportPage: null, rulePage: null, personPage: null }, { replace: true });
  const set = (key: keyof SopReportFilters) => (value: string) => {
    setFilters({ ...filters, [key]: value });
    toFirstPages();
  };
  const base = `/azure/${encodeURIComponent(credentialId)}/projects/${encodeURIComponent(projectId)}/work-items`;

  return (
    <div className="flex flex-col gap-5">
      <FilterBar
        filters={[
          { id: "person", label: "Person", value: filters.person, options: data.facets.people, onChange: set("person") },
          { id: "role", label: "Role", value: filters.role, options: data.facets.roles, onChange: set("role") },
          { id: "rule", label: "Gap", value: filters.rule, options: data.facets.rules, onChange: set("rule") },
          { id: "type", label: "Type", value: filters.type, options: data.facets.types, onChange: set("type") },
          { id: "state", label: "State", value: filters.state, options: data.facets.states, onChange: set("state") },
        ]}
        shown={data.itemsChecked}
        total={data.run.itemsChecked}
        onClear={() => {
          setFilters(NO_FILTERS);
          toFirstPages();
        }}
      />
      <Updating active={report.isPlaceholderData}>
        {data.facets.roles.every((role) => role.value === "developer") ? (
          <p className="text-xs text-slate-500">
            Everyone counts as a developer until the project's team leads, QA and product owners are listed in its set-up (SOP rules → Projects → Advanced).
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Tickets checked" value={data.itemsChecked} hint={`default rules v${data.run.defaultVersion}`} />
          <StatTile label="With SOP gaps" value={data.itemsWithGaps} />
          <StatTile label="Compliant" value={percent(data.compliantShare)} />
          <StatTile label="Run" value={<span className="text-base">{formatRelative(data.run.createdAt)}</span>} hint={formatDateTime(data.run.createdAt)} />
          {data.trackedHours !== null ? (
            <StatTile label="Tracked (Solidtime)" value={`${data.trackedHours} h`} hint={data.run.timeScope === "team" ? "whole team" : "your own time only"} />
          ) : null}
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className={TABLE} aria-label="Gaps by rule">
                <thead className={HEAD}>
                  <tr>
                    <th className="px-3 py-2 font-medium">Rule</th>
                    <th className="px-3 py-2 text-right font-medium">Failing</th>
                    <th className="px-3 py-2 text-right font-medium">Checked</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.byRule.items.map((rule) => (
                    <tr key={rule.ruleId}>
                      <td className="px-3 py-2">
                        <StatusBadge tone={rule.failing ? SEVERITY_TONES[rule.severity] : "success"}>{rule.ruleId}</StatusBadge>{" "}
                        <span className="text-slate-800">{rule.ruleTitle}</span>
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-slate-900">{rule.failing}</td>
                      <td className="px-3 py-2 text-right text-slate-600">{rule.checked}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              label="Gaps by rule pages"
              page={data.byRule.page}
              totalPages={data.byRule.totalPages}
              total={data.byRule.total}
              pageSize={data.byRule.pageSize}
              disabled={busy}
              onChange={(next) => rulePage.setPage(next)}
            />
          </div>

          <div>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className={TABLE} aria-label="Gaps by person">
                <thead className={HEAD}>
                  <tr>
                    <th className="px-3 py-2 font-medium">Assigned to</th>
                    <th className="px-3 py-2 text-right font-medium">Tickets</th>
                    <th className="px-3 py-2 text-right font-medium">With gaps</th>
                    <th className="px-3 py-2 text-right font-medium">Gaps</th>
                    {data.run.timeScope ? <th className="px-3 py-2 text-right font-medium">Tracked</th> : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.byPerson.items.map((person) => (
                    <tr key={person.personKey}>
                      <td className="px-3 py-2 text-slate-800">
                        {person.assignee?.displayName ?? "Unassigned"}{" "}
                        <span className="text-xs text-slate-500">{person.roles.map((role) => ROLE_LABELS[role]).join(", ")}</span>
                      </td>
                      <td className="px-3 py-2 text-right text-slate-600">{person.items}</td>
                      <td className="px-3 py-2 text-right text-slate-600">{person.itemsWithGaps}</td>
                      <td className="px-3 py-2 text-right font-medium text-slate-900">{person.gaps}</td>
                      {data.run.timeScope ? <td className="px-3 py-2 text-right text-slate-600">{person.trackedHours ?? 0} h</td> : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              label="Gaps by person pages"
              page={data.byPerson.page}
              totalPages={data.byPerson.totalPages}
              total={data.byPerson.total}
              pageSize={data.byPerson.pageSize}
              disabled={busy}
              onChange={(next) => personPage.setPage(next)}
            />
          </div>
        </div>

        {data.items.total > 0 ? (
          <details open={ticketsOpen} onToggle={(event) => setTicketsOpen(event.currentTarget.open)}>
            <summary className="cursor-pointer text-sm font-medium text-slate-700">Tickets with gaps ({data.items.total})</summary>
            <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
              {data.items.items.map((item) => (
                <li key={item.workItemId} className="flex flex-col gap-1 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                  <Link to={`${base}/${item.workItemId}`} className="text-sm font-medium text-indigo-700 hover:underline">
                    #{item.workItemId} {item.title}
                  </Link>
                  <span className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
                    {item.assignee?.displayName ?? "Unassigned"} · {item.type} · {item.state}
                    {typeof item.trackedHours === "number" ? ` · ${item.trackedHours} h tracked` : ""} ·
                    {item.violations.map((violation) => (
                      <StatusBadge key={violation.ruleId} tone={SEVERITY_TONES[violation.severity]} title={`${violation.ruleTitle}: ${violation.message}`}>
                        {violation.ruleId}
                      </StatusBadge>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
            <Pagination
              label="Tickets with gaps pages"
              page={data.items.page}
              totalPages={data.items.totalPages}
              total={data.items.total}
              pageSize={data.items.pageSize}
              disabled={busy}
              onChange={(next) => itemsPage.setPage(next)}
            />
          </details>
        ) : data.itemsChecked > 0 ? (
          <p className="text-sm text-emerald-700">No SOP gaps in these tickets.</p>
        ) : (
          <EmptyState>No tickets match these filters.</EmptyState>
        )}
      </Updating>
    </div>
  );
}
