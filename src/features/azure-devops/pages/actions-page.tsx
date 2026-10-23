import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ActionReviewDialog } from "../components/action-review-dialog";
import { EmptyState, ErrorCard, SectionCard, SkeletonRows } from "../components/feedback";
import { StatusBadge } from "../components/status-badge";
import { useActions, useAuditLogs } from "../hooks/use-actions";
import type { ProposedAction } from "../types/action.types";
import { formatDateTime, formatRelative } from "../utils/format";
import { ACTION_STATUS_TONES, actionKindLabel } from "../utils/labels";

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
              {actionKindLabel(action.kind)} · {action.projectId} · proposed {formatRelative(action.createdAt)}
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

export function ActionsPage() {
  const pending = useActions("PENDING");
  const all = useActions();
  const audit = useAuditLogs();
  const [reviewing, setReviewing] = useState<ProposedAction | null>(null);
  const history = (all.data ?? []).filter((action) => action.status !== "PENDING");

  return (
    <section className="flex w-full flex-col gap-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">Azure DevOps</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Approvals & audit</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Every change to Azure DevOps is proposed first and runs only after you approve it. Pending proposals expire after 15 minutes.
        </p>
      </div>

      <SectionCard title="Awaiting your approval">
        {pending.isLoading ? (
          <SkeletonRows rows={2} />
        ) : pending.error ? (
          <ErrorCard error={pending.error} onRetry={() => void pending.refetch()} />
        ) : (pending.data ?? []).length === 0 ? (
          <EmptyState>No pending changes.</EmptyState>
        ) : (
          <ActionRows actions={pending.data ?? []} onReview={setReviewing} />
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
        ) : (audit.data ?? []).length === 0 ? (
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
                {(audit.data ?? []).map((entry) => (
                  <tr key={entry.id}>
                    <td className="py-2 pr-3 text-slate-600">{formatDateTime(entry.createdAt)}</td>
                    <td className="px-3 py-2 font-medium text-slate-900">{entry.event}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-500">{entry.actionId?.slice(0, 8) ?? "—"}</td>
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
