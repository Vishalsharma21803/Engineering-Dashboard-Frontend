import { useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { ActionReviewDialog } from "../components/action-review-dialog";
import { EmptyState, ErrorCard, SectionCard, SkeletonRows } from "../components/feedback";
import { StatusBadge } from "../components/status-badge";
import { useActions, useAuditLogs } from "../hooks/use-actions";
import { useProjects } from "../hooks/use-projects";
import type { AuditEvent, ProposedAction } from "../types/action.types";
import { formatDateTime, formatRelative } from "../utils/format";
import { ACTION_STATUS_TONES, actionKindLabel, type Tone } from "../utils/labels";

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
              <StatusBadge tone={ACTION_STATUS_TONES[action.status]}>{action.status}</StatusBadge>
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

/** embedded: rendered inside the cockpit layout, which already shows the page header. */
export function ActionsPage({ embedded = false }: { embedded?: boolean }) {
  const { credentialId } = useParams();
  const [searchParams] = useSearchParams();
  const projects = useProjects(credentialId ?? "");
  const pending = useActions("PENDING");
  const all = useActions();
  const audit = useAuditLogs();
  const [reviewing, setReviewing] = useState<ProposedAction | null>(null);

  // Inside the cockpit, show only the selected organization (and project, if one is chosen).
  const projectParam = embedded ? searchParams.get("project") : null;
  const project = projectParam
    ? projects.data?.projects.find((candidate) => candidate.id === projectParam || candidate.name === projectParam) ?? {
        id: projectParam,
        name: projectParam,
      }
    : null;
  const inScope = (action: ProposedAction) =>
    (!embedded || action.credentialId === credentialId) &&
    (!project ||
      action.projectId === project.id ||
      action.projectId.toLowerCase() === project.name.toLowerCase());

  const pendingActions = (pending.data ?? []).filter(inScope);
  const scopedActions = (all.data ?? []).filter(inScope);
  const history = scopedActions.filter((action) => action.status !== "PENDING");
  const summaries = new Map(scopedActions.map((action) => [action.id, action.summary]));
  const auditEntries = (audit.data ?? []).filter(
    (entry) => !embedded || (entry.actionId !== null && summaries.has(entry.actionId))
  );

  return (
    <section className="flex w-full flex-col gap-6">
      {embedded ? (
        <p className="text-sm leading-6 text-slate-600">
          {project ? (
            <>
              Showing changes for <span className="font-medium text-slate-900">{project.name}</span>. Choose “All projects” in the header to see every project.{" "}
            </>
          ) : null}
          Every change to Azure DevOps is proposed first and runs only after you approve it. Pending proposals expire after 15 minutes.
        </p>
      ) : (
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">Azure DevOps</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Approvals & audit</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Every change to Azure DevOps is proposed first and runs only after you approve it. Pending proposals expire after 15 minutes.
          </p>
        </div>
      )}

      <SectionCard title="Awaiting your approval">
        {pending.isLoading ? (
          <SkeletonRows rows={2} />
        ) : pending.error ? (
          <ErrorCard error={pending.error} onRetry={() => void pending.refetch()} />
        ) : pendingActions.length === 0 ? (
          <EmptyState>No pending changes.</EmptyState>
        ) : (
          <ActionRows actions={pendingActions} onReview={setReviewing} />
        )}
      </SectionCard>

      <SectionCard title="History">
        {all.isLoading ? (
          <SkeletonRows rows={2} />
        ) : all.error ? (
          <ErrorCard error={all.error} onRetry={() => void all.refetch()} />
        ) : history.length === 0 ? (
          <EmptyState>No decided actions yet.</EmptyState>
        ) : (
          <ActionRows actions={history} onReview={setReviewing} />
        )}
      </SectionCard>

      <SectionCard title="Audit log" description="Append-only record of proposals, approvals, rejections and executions.">
        {audit.isLoading ? (
          <SkeletonRows rows={3} />
        ) : audit.error ? (
          <ErrorCard error={audit.error} onRetry={() => void audit.refetch()} />
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
                      {(entry.actionId && summaries.get(entry.actionId)) ?? (
                        <span className="font-mono text-xs text-slate-500">{entry.actionId?.slice(0, 8) ?? "—"}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500">{entry.ipAddress ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <ActionReviewDialog action={reviewing} onClose={() => setReviewing(null)} />
    </section>
  );
}
