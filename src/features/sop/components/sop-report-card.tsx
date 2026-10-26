import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { Spinner } from "@/components/ui/spinner";
import { ErrorCard, SectionCard, StatTile } from "@/features/azure-devops/components/feedback";
import { StatusBadge } from "@/features/azure-devops/components/status-badge";
import { formatRelative } from "@/features/azure-devops/utils/format";
import { SEVERITY_TONES } from "@/features/azure-devops/utils/labels";
import { usePageParam, useSyncServedPage } from "@/hooks/use-page-param";
import { getSopReport } from "../api/sop.api";
import { sopKeys } from "../api/sop.keys";

const TABLE = "w-full text-left text-sm";
const HEAD = "bg-slate-50 text-xs uppercase tracking-wide text-slate-500";

function percent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

/**
 * The team's SOP picture for one project. Built on request because it
 * checks every open and recently closed ticket in the project.
 */
export function SopReportCard({ credentialId, projectId }: { credentialId: string; projectId: string }) {
  const queryClient = useQueryClient();
  const [requested, setRequested] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const pageParam = usePageParam("reportPage");
  const { page, setPage } = pageParam;
  const report = useQuery({
    queryKey: [...sopKeys.report(credentialId, projectId), page],
    queryFn: () => getSopReport(credentialId, projectId, page),
    enabled: requested,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
  useSyncServedPage(pageParam, report.data && !report.isPlaceholderData ? report.data.items.page : undefined);

  /** Rebuilds on the server (bypassing its 10-minute copy), then reloads the pages from the fresh report. */
  async function rebuild() {
    setRebuilding(true);

    try {
      await getSopReport(credentialId, projectId, page, true);
    } catch {
      // The refetch below shows the error state.
    } finally {
      setRebuilding(false);
      await queryClient.invalidateQueries({ queryKey: sopKeys.report(credentialId, projectId) });
    }
  }

  const busy = report.isFetching || rebuilding;
  const base = `/azure/${encodeURIComponent(credentialId)}/projects/${encodeURIComponent(projectId)}/work-items`;

  return (
    <SectionCard
      title="Team SOP report"
      description="Every open or recently closed ticket in this project, checked with the default SOP rules (code rules only; AI results stay private to each person)."
      actions={
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => (requested ? void rebuild() : setRequested(true))}>
          {busy ? <Spinner className="size-4" /> : null}
          {report.data ? "Rebuild report" : "Build report"}
        </Button>
      }
    >
      {!requested ? (
        <p className="text-sm text-slate-500">Building the report reads every ticket in the project; it can take a minute.</p>
      ) : report.error ? (
        <ErrorCard error={report.error} credentialId={credentialId} onRetry={() => void report.refetch()} />
      ) : !report.data ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Spinner className="size-4" /> Checking the team's tickets…
        </p>
      ) : !report.data.configured ? (
        <p className="text-sm text-slate-600">
          {report.data.projectName} is not set up for SOP checks yet.{" "}
          <Link to="/sop-rules?tab=projects" className="font-medium text-indigo-700 hover:underline">
            Set it up
          </Link>
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Tickets checked" value={report.data.itemsChecked} hint={`default rules v${report.data.defaultVersion}`} />
            <StatTile label="With SOP gaps" value={report.data.itemsWithGaps} />
            <StatTile label="Compliant" value={percent(report.data.compliantShare)} />
            <StatTile label="Built" value={<span className="text-base">{formatRelative(report.data.generatedAt)}</span>} />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
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
                  {report.data.byRule.map((rule) => (
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

            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className={TABLE} aria-label="Gaps by person">
                <thead className={HEAD}>
                  <tr>
                    <th className="px-3 py-2 font-medium">Assigned to</th>
                    <th className="px-3 py-2 text-right font-medium">Tickets</th>
                    <th className="px-3 py-2 text-right font-medium">With gaps</th>
                    <th className="px-3 py-2 text-right font-medium">Gaps</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.data.byPerson.map((person) => (
                    <tr key={person.assignee?.id ?? person.assignee?.uniqueName ?? "unassigned"}>
                      <td className="px-3 py-2 text-slate-800">{person.assignee?.displayName ?? "Unassigned"}</td>
                      <td className="px-3 py-2 text-right text-slate-600">{person.items}</td>
                      <td className="px-3 py-2 text-right text-slate-600">{person.itemsWithGaps}</td>
                      <td className="px-3 py-2 text-right font-medium text-slate-900">{person.gaps}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {report.data.items.total > 0 ? (
            <details open={page > 1 || undefined}>
              <summary className="cursor-pointer text-sm font-medium text-slate-700">Tickets with gaps ({report.data.items.total})</summary>
              <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
                {report.data.items.items.map((item) => (
                  <li key={item.workItemId} className="flex flex-col gap-1 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                    <Link to={`${base}/${item.workItemId}`} className="text-sm font-medium text-indigo-700 hover:underline">
                      #{item.workItemId} {item.title}
                    </Link>
                    <span className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
                      {item.assignee?.displayName ?? "Unassigned"} ·
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
                page={report.data.items.page}
                totalPages={report.data.items.totalPages}
                total={report.data.items.total}
                pageSize={report.data.items.pageSize}
                disabled={busy}
                onChange={(next) => setPage(next)}
              />
            </details>
          ) : null}
        </div>
      )}
    </SectionCard>
  );
}
