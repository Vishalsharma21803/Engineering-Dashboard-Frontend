import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Updating } from "@/components/ui/updating";
import { Pagination } from "@/components/ui/pagination";
import { usePageParam, useSyncServedPage } from "@/hooks/use-page-param";
import { ActionReviewDialog } from "../components/action-review-dialog";
import { EmptyState, ErrorCard, SectionCard, SkeletonRows } from "../components/feedback";
import { StatusBadge } from "../components/status-badge";
import { useActions, useAuditLogs } from "../hooks/use-actions";
import { useProjects } from "../hooks/use-projects";
import type { ActionListFilter, AuditEvent, ProposedAction } from "../types/action.types";
import type { Page } from "../types/azure.types";
import { formatDateTime, formatRelative } from "../utils/format";
import { ACTION_STATUS_LABELS, ACTION_STATUS_TONES, actionKindLabel, type Tone } from "../utils/labels";

const AUDIT_TONES: Record<AuditEvent, Tone> = {
  PROPOSED: "info",
  APPROVED: "info",
  REJECTED: "neutral",
  EXPIRED: "neutral",
  EXECUTION_STARTED: "info",
  EXECUTION_SUCCEEDED: "success",
  EXECUTION_FAILED: "danger",
};

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function organizationName(url: string): string {
  return url.replace(/^https:\/\//, "").replace(/^dev\.azure\.com\//, "").replace(/\.visualstudio\.com$/, "");
}

function ActionRows({ actions, onReview }: { actions: ProposedAction[]; onReview: (action: ProposedAction) => void }) {
  return (
    <ul className="divide-y divide-slate-100">
      {actions.map((action) => (
        <li key={action.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={ACTION_STATUS_TONES[action.status]}>{ACTION_STATUS_LABELS[action.status] ?? action.status}</StatusBadge>
              <span className="font-medium text-slate-950">{action.summary}</span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              {actionKindLabel(action.kind)} · {organizationName(action.organizationUrl)}
              {GUID.test(action.projectId) ? "" : ` / ${action.projectId}`} · proposed {formatRelative(action.createdAt)}
              {action.errorCode ? ` · ${action.errorCode}` : ""}
            </p>
          </div>
          <Button size="sm" variant={action.status === "PENDING" ? "primary" : "secondary"} onClick={() => onReview(action)}>
            {action.status === "PENDING" ? "Review" : "Details"}
          </Button>
        </li>
      ))}
    </ul>
  );
}

function ListPager({ label, page, disabled, onChange }: { label: string; page: Page<unknown> | undefined; disabled: boolean; onChange: (page: number) => void }) {
  return page ? (
    <Pagination label={label} page={page.page} totalPages={page.totalPages} total={page.total} pageSize={page.pageSize} disabled={disabled} onChange={onChange} />
  ) : null;
}

/** embedded: rendered inside the cockpit layout, which already shows the page header. */
export function ActionsPage({ embedded = false }: { embedded?: boolean }) {
  const { credentialId } = useParams();
  const [searchParams] = useSearchParams();
  const projects = useProjects(credentialId ?? "");
  const [reviewing, setReviewing] = useState<ProposedAction | null>(null);

  // Inside the cockpit, show only the selected organization (and project, if one is chosen).
  const projectParam = embedded ? searchParams.get("project") : null;
  const project = projectParam
    ? projects.data?.projects.find((candidate) => candidate.id === projectParam || candidate.name === projectParam) ?? {
        id: projectParam,
        name: projectParam,
      }
    : null;
  // The server filters and pages; actions on a project are matched by its id or name.
  const scope: ActionListFilter = {
    ...(embedded && credentialId ? { credentialId } : {}),
    ...(project ? { projectId: project.id, projectName: project.name } : {}),
  };
  // Each list keeps its own page in the URL.
  const pendingList = usePageParam("pendingPage");
  const historyList = usePageParam("historyPage");
  const auditList = usePageParam("auditPage");
  const pending = useActions({ ...scope, status: "PENDING", page: pendingList.page });
  const all = useActions({ ...scope, history: true, page: historyList.page });
  const audit = useAuditLogs({ ...scope, page: auditList.page });
  useSyncServedPage(pendingList, pending.data && !pending.isPlaceholderData ? pending.data.page : undefined);
  useSyncServedPage(historyList, all.data && !all.isPlaceholderData ? all.data.page : undefined);
  useSyncServedPage(auditList, audit.data && !audit.isPlaceholderData ? audit.data.page : undefined);
  const pendingActions = pending.data?.items ?? [];
  const history = all.data?.items ?? [];
  const auditEntries = audit.data?.items ?? [];
  // The standalone page has no tab of its own in the navigation: a way back to where it was opened from.
  const fromTime = searchParams.get("from") === "time";

  return (
    <section className="flex w-full flex-col gap-6">
      {embedded ? (
        <p className="text-sm leading-6 text-slate-600">
          {project ? (
            <>
              Showing changes for <span className="font-medium text-slate-900">{project.name}</span>. Choose “All projects” in the header to see every project.{" "}
            </>
          ) : null}
          Every change Cockpit makes to Azure DevOps is proposed first and runs only after you approve it. Pending proposals expire after 15 minutes.
        </p>
      ) : (
        <div>
          <Link
            to={fromTime ? "/time" : "/"}
            className="inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-slate-500 outline-none transition hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            {fromTime ? "Back to Time" : "Back to Overview"}
          </Link>
          <h1 className="mt-6 text-3xl font-semibold tracking-tight text-slate-950">Approvals & audit</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Every change Cockpit makes to Azure DevOps or Solidtime is proposed first and runs only after you approve it. Pending proposals expire after 15 minutes.
          </p>
        </div>
      )}

      <SectionCard title="Awaiting your approval">
        <Updating active={pending.isPlaceholderData}>
          {pending.isLoading ? (
            <SkeletonRows rows={2} />
          ) : pending.error ? (
            <ErrorCard error={pending.error} onRetry={() => void pending.refetch()} isRetrying={pending.isFetching} />
          ) : pendingActions.length === 0 ? (
            <EmptyState>No pending changes.</EmptyState>
          ) : (
            <ActionRows actions={pendingActions} onReview={setReviewing} />
          )}
        </Updating>
        <ListPager label="Awaiting approval pages" page={pending.data} disabled={pending.isFetching} onChange={(page) => pendingList.setPage(page)} />
      </SectionCard>

      <SectionCard title="History">
        <Updating active={all.isPlaceholderData}>
          {all.isLoading ? (
            <SkeletonRows rows={2} />
          ) : all.error ? (
            <ErrorCard error={all.error} onRetry={() => void all.refetch()} isRetrying={all.isFetching} />
          ) : history.length === 0 ? (
            <EmptyState>No decided actions yet.</EmptyState>
          ) : (
            <ActionRows actions={history} onReview={setReviewing} />
          )}
        </Updating>
        <ListPager label="History pages" page={all.data} disabled={all.isFetching} onChange={(page) => historyList.setPage(page)} />
      </SectionCard>

      <SectionCard title="Audit log" description="Append-only record of proposals, approvals, rejections and executions.">
        <Updating active={audit.isPlaceholderData}>
          {audit.isLoading ? (
            <SkeletonRows rows={3} />
          ) : audit.error ? (
            <ErrorCard error={audit.error} onRetry={() => void audit.refetch()} isRetrying={audit.isFetching} />
          ) : auditEntries.length === 0 ? (
            <EmptyState>No audit entries yet.</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="py-2 pr-3 font-medium">When</th>
                    <th className="px-3 py-2 font-medium">Event</th>
                    <th className="px-3 py-2 font-medium">Action</th>
                    <th className="px-3 py-2 font-medium">From</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditEntries.map((entry) => (
                    <tr key={entry.id}>
                      <td className="py-2 pr-3 text-slate-600">{formatDateTime(entry.createdAt)}</td>
                      <td className="px-3 py-2">
                        <StatusBadge tone={AUDIT_TONES[entry.event]}>{entry.event.replace(/_/g, " ").toLowerCase()}</StatusBadge>
                      </td>
                      <td className="px-3 py-2 text-slate-700">
                        {entry.actionSummary ?? <span className="font-mono text-xs text-slate-500">{entry.actionId?.slice(0, 8) ?? "—"}</span>}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-500">{entry.ipAddress ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Updating>
        <ListPager label="Audit log pages" page={audit.data} disabled={audit.isFetching} onChange={(page) => auditList.setPage(page)} />
      </SectionCard>

      <ActionReviewDialog action={reviewing} onClose={() => setReviewing(null)} />
    </section>
  );
}
