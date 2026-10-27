import { Link, useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { buttonClassName } from "@/components/ui/button-styles";
import { ActionReviewDialog } from "../components/action-review-dialog";
import { EmptyState, ErrorCard, ErrorToast, SectionCard, SectionView, SkeletonRows } from "../components/feedback";
import { StatusBadge } from "../components/status-badge";
import {
  PriorityBadge,
  WorkItemStateBadge,
  WorkItemTypeBadge,
} from "../components/work-item-badges";
import { workItemTypeStyle } from "../utils/work-item-types";
import { cn } from "@/utils/cn";
import { WorkItemActions } from "../components/work-item-actions";
import { TicketTimePanel } from "@/features/solidtime/components/ticket-time-panel";
import { useActionReview } from "../hooks/use-action-review";
import { useWorkItem } from "../hooks/use-work-item";
import type { ActionKind } from "../types/action.types";
import { formatDateTime, formatRelative, formatValue } from "../utils/format";
import { SopResultPanel } from "@/features/sop/components/sop-result-panel";
import { useSopAiChecks } from "@/features/sop/hooks/use-sop-ai";
import { fixToAction } from "@/features/sop/utils/ai-check";
import { actionKindLabel } from "../utils/labels";

function Field({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-slate-900">{formatValue(value)}</dd>
    </div>
  );
}

export function WorkItemDetailPage() {
  const { credentialId = "", projectId = "", workItemId = "" } = useParams();
  const id = Number(workItemId);
  const { data: workItem, isLoading, error, refetch } = useWorkItem(credentialId, projectId, id);
  const review = useActionReview();
  // Viewing a ticket checks it with AI if it changed since its last check.
  const ai = useSopAiChecks(credentialId, workItem ? [workItem.id] : [], workItem ? `${workItem.id}:${workItem.rev}` : null);

  if (isLoading) return <SkeletonRows rows={5} />;
  if (error || !workItem) {
    return <ErrorCard error={error} credentialId={credentialId} onRetry={() => void refetch()} />;
  }

  const base = `/azure/${encodeURIComponent(credentialId)}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-surface p-5 pl-6 shadow-sm">
        <span aria-hidden="true" className={cn("absolute inset-y-0 left-0 w-1.5", workItemTypeStyle(workItem.type).bar)} />
        <nav aria-label="Breadcrumb" className="text-sm text-slate-500">
          <Link to={base} className="hover:text-indigo-600">
            My work
          </Link>
          {" / "}
          <Link to={`${base}/projects/${encodeURIComponent(workItem.projectName)}`} className="hover:text-indigo-600">
            {workItem.projectName}
          </Link>
          {" / "}#{workItem.id}
        </nav>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
          <span className="text-slate-400">#{workItem.id}</span> {workItem.title}
        </h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <WorkItemTypeBadge type={workItem.type} />
          <WorkItemStateBadge state={workItem.state} category={workItem.stateCategory} />
          <PriorityBadge priority={workItem.priority} />
          <span className="text-xs text-slate-500">changed {formatRelative(workItem.changedDate)}</span>
          {workItem.blocked ? <StatusBadge tone="danger">Blocked</StatusBadge> : null}
          {workItem.tags.map((tag) => (
            <StatusBadge key={tag} tone="neutral" dot={false}>
              {tag}
            </StatusBadge>
          ))}
          <a href={workItem.webUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-indigo-600 hover:text-indigo-500">
            Open in Azure DevOps ↗
          </a>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        <Field label="Priority" value={workItem.priority} />
        <Field label="Assigned to" value={workItem.assignedTo?.displayName ?? null} />
        <Field label="Original estimate" value={workItem.originalEstimate} />
        <Field label="Story points / effort" value={workItem.storyPoints ?? workItem.effort} />
        <Field label="Completed" value={workItem.completedWork} />
        <Field label="Remaining" value={workItem.remainingWork} />
        <Field label="Iteration" value={workItem.iterationPath} />
      </dl>

      <SectionCard title="SOP compliance" description="Checked against your SOP rules (the default rules plus your own changes).">
        <SopResultPanel
          result={workItem.compliance}
          ai={{
            configured: ai.configured,
            check: ai.checks.get(workItem.id),
            onRecheck: () => ai.recheck([workItem.id]),
            isRechecking: ai.isRechecking,
            currentProvider: ai.currentProvider,
            enqueueError: ai.enqueueError,
            isProposing: review.isProposing,
            onUseFix: (_result, fix) =>
              review.propose({
                credentialId,
                source: "AI_SUGGESTION",
                target: { projectId: workItem.projectName, workItemId: workItem.id },
                ...fixToAction(fix),
              }),
          }}
          renderAction={(violation) =>
                violation.suggestedAction && !violation.suggestedAction.requiresInput ? (
                  <Button
                    size="sm"
                    disabled={review.isProposing}
                    onClick={() =>
                      review.propose({
                        credentialId,
                        kind: violation.suggestedAction?.kind as ActionKind,
                        source: "RECOMMENDATION",
                        target: violation.suggestedAction?.target ?? {},
                        params: violation.suggestedAction?.params ?? {},
                      })
                    }
                  >
                    Review: {actionKindLabel(violation.suggestedAction.kind)}
                  </Button>
                ) : violation.suggestedAction ? (
                  <a href="#propose-change" className={buttonClassName({ size: "sm", variant: "secondary" })}>
                    {actionKindLabel(violation.suggestedAction.kind)} ↓
                  </a>
                ) : null
          }
        />
      </SectionCard>

      <TicketTimePanel
        azureCredentialId={credentialId}
        ticket={{ id: workItem.id, title: workItem.title, projectName: workItem.projectName }}
        onPropose={(input) => review.propose(input)}
        isProposing={review.isProposing}
      />

      <div id="propose-change" className="scroll-mt-24">
        <SectionCard title="Propose a change" description="Nothing is written to Azure DevOps until you approve it in the review dialog.">
          <WorkItemActions
            credentialId={credentialId}
            workItem={workItem}
            isProposing={review.isProposing}
            onPropose={review.propose}
          />
        </SectionCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Description">
          {workItem.description || workItem.reproSteps ? (
            <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{workItem.description || workItem.reproSteps}</p>
          ) : (
            <EmptyState>No description.</EmptyState>
          )}
          {workItem.acceptanceCriteria ? (
            <>
              <h3 className="mt-4 text-sm font-semibold text-slate-900">Acceptance criteria</h3>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{workItem.acceptanceCriteria}</p>
            </>
          ) : null}
        </SectionCard>

        <SectionCard title="Linked pull requests">
          <SectionView section={workItem.linkedPullRequests} label="linked pull requests">
            {(pullRequests) =>
              pullRequests.length === 0 ? (
                <EmptyState>No pull requests linked.</EmptyState>
              ) : (
                <ul className="space-y-2">
                  {pullRequests.map((pr) => (
                    <li key={`${pr.repositoryId}:${pr.pullRequestId}`} className="flex items-center justify-between gap-2 text-sm">
                      <Link
                        to={`${base}/projects/${encodeURIComponent(pr.projectId)}/repos/${encodeURIComponent(pr.repositoryId)}/pull-requests/${pr.pullRequestId}`}
                        className="font-medium text-slate-900 hover:text-indigo-600"
                      >
                        !{pr.pullRequestId} {pr.title ?? "(unavailable)"}
                      </Link>
                      <StatusBadge tone={pr.status === "completed" ? "success" : pr.status === "active" ? "info" : "neutral"}>
                        {pr.status}
                      </StatusBadge>
                    </li>
                  ))}
                </ul>
              )
            }
          </SectionView>
        </SectionCard>

        <SectionCard title="Comments">
          <SectionView section={workItem.comments} label="comments">
            {(comments) =>
              comments.length === 0 ? (
                <EmptyState>No comments yet.</EmptyState>
              ) : (
                <ul className="space-y-3">
                  {comments.map((comment) => (
                    <li key={comment.id} className="rounded-lg border border-slate-100 p-3">
                      <p className="text-xs text-slate-500">
                        {comment.createdBy.displayName} · {formatDateTime(comment.createdDate)}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{comment.text}</p>
                    </li>
                  ))}
                </ul>
              )
            }
          </SectionView>
        </SectionCard>

        <SectionCard title="Work log history" description="Estimate, remaining, completed work and state changes.">
          <SectionView section={workItem.history} label="history">
            {(history) =>
              history.length === 0 ? (
                <EmptyState>No work log updates yet.</EmptyState>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {history.slice(0, 20).map((change, index) => (
                    <li key={index} className="flex justify-between gap-2">
                      <span className="text-slate-700">
                        {change.field}: {formatValue(change.oldValue)} → <span className="font-medium">{formatValue(change.newValue)}</span>
                      </span>
                      <span className="shrink-0 text-xs text-slate-500">
                        {change.revisedBy?.displayName ?? ""} · {formatRelative(change.revisedDate)}
                      </span>
                    </li>
                  ))}
                </ul>
              )
            }
          </SectionView>
        </SectionCard>
      </div>

      <ActionReviewDialog action={review.reviewing} onClose={review.closeReview} />
      <ErrorToast message={review.proposeError} onDismiss={review.clearProposeError} />
    </div>
  );
}
