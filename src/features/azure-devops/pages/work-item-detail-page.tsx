import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { ActiveIndicator } from "@/components/ui/active-indicator";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError } from "@/lib/api-client";
import { ActionReviewDialog } from "../components/action-review-dialog";
import { EmptyState, ErrorCard, ErrorToast, NotFoundCard, PartialReadNotice, SectionCard, SectionView, SkeletonRows, StaleDataBanner } from "../components/feedback";
import { StatusBadge } from "../components/status-badge";
import {
  PriorityBadge,
  WorkItemStateBadge,
  WorkItemTypeBadge,
  WorkItemTypeIcon,
} from "../components/work-item-badges";
import { workItemTypeStyle } from "../utils/work-item-types";
import { cn } from "@/utils/cn";
import { WorkItemActions } from "../components/work-item-actions";
import { PANEL_FOR_KIND, type ActionPanel } from "../utils/action-panels";
import { TicketTimePanel } from "@/features/solidtime/components/ticket-time-panel";
import { useActionReview } from "../hooks/use-action-review";
import { useWorkItem } from "../hooks/use-work-item";
import type { ActionKind } from "../types/action.types";
import type { GroupHeading, WorkFieldChange, WorkItemFamily } from "../types/azure.types";
import { formatDateTime, formatRelative, formatValue } from "../utils/format";
import { SopResultPanel } from "@/features/sop/components/sop-result-panel";
import { useSopAiReview } from "@/features/sop/hooks/use-sop-ai";
import { fixToAction } from "@/features/sop/utils/ai-check";
import { actionKindLabel } from "../utils/labels";

/** Readable names for the fields in the work log history. */
const HISTORY_FIELDS: Record<WorkFieldChange["field"], { label: string; hours: boolean }> = {
  OriginalEstimate: { label: "Original estimate", hours: true },
  RemainingWork: { label: "Remaining work", hours: true },
  CompletedWork: { label: "Completed work", hours: true },
  State: { label: "State", hours: false },
};

function withHours(value: string | number | null, hours: boolean): string {
  const text = formatValue(value);
  return hours && text !== "—" ? `${text} h` : text;
}

/** A detail tile; an empty value is muted, or the tile is left out when `optional`. */
function Field({ label, value, hours = false, optional = false }: { label: string; value: string | number | null; hours?: boolean; optional?: boolean }) {
  const empty = formatValue(value) === "—";

  if (empty && optional) {
    return null;
  }

  return (
    <div className="min-w-0 rounded-lg border border-slate-100 bg-slate-50 p-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={cn("mt-1 break-words text-sm font-semibold", empty ? "font-normal text-slate-400" : "text-slate-900")}>
        {withHours(value, hours)}
      </dd>
    </div>
  );
}

const typeColor = (type: string) => workItemTypeStyle(type).chip.split(" ").find((token) => token.startsWith("text-")) ?? "text-slate-600";

/** A ticket in one line: its type icon and a link to it. */
function TicketLink({ base, ticket, strong = false }: { base: string; ticket: GroupHeading; strong?: boolean }) {
  return (
    <Link to={`${base}/projects/${encodeURIComponent(ticket.projectName)}/work-items/${ticket.id}`} className={cn("inline-flex min-w-0 items-center gap-1.5 hover:text-indigo-700", strong ? "font-medium text-slate-900" : "text-slate-800")}>
      <WorkItemTypeIcon type={ticket.type} className={cn("size-4", typeColor(ticket.type))} />
      <span className="truncate">
        <span className="text-slate-500 tabular-nums">#{ticket.id}</span> {ticket.title}
      </span>
    </Link>
  );
}

/** "Part of US #120 Checkout flow · Assigned to Ravi" under the title. */
function ParentLine({ base, family }: { base: string; family: WorkItemFamily }) {
  const parent = family.parent;
  if (!parent) return null;

  return (
    <p className="mt-2 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-slate-600">
      Part of
      {parent.readable ? (
        <>
          <TicketLink base={base} ticket={parent} strong />
          <span className={family.parentIsMine ? "font-medium text-indigo-700" : "text-slate-500"}>
            · {family.parentIsMine ? "assigned to you" : parent.assignedTo ? `assigned to ${parent.assignedTo.displayName}` : "unassigned"}
          </span>
        </>
      ) : (
        <span>#{parent.id} (could not be read from Azure DevOps)</span>
      )}
    </p>
  );
}

export function WorkItemDetailPage() {
  const { credentialId = "", projectId = "", workItemId = "" } = useParams();
  const id = Number(workItemId);
  const { data: workItem, isLoading, isFetching, error, refetch } = useWorkItem(credentialId, projectId, id);
  const review = useActionReview();
  const [panel, setPanel] = useState<ActionPanel | null>(null);
  const [tab, setTab] = useState("comments");
  // Opening a ticket asks the AI to review it (skipped when the saved review is up to date).
  // A finished review reloads the ticket, whose SOP result then includes the AI's clears.
  const ai = useSopAiReview(credentialId, workItem ? { id: workItem.id, rev: workItem.rev } : undefined, () => void refetch());

  if (!Number.isInteger(id) || id <= 0) {
    return <EmptyState>“{workItemId}” is not a ticket number.</EmptyState>;
  }

  if (isLoading) return <SkeletonRows rows={5} />;
  if (!workItem) {
    // Only Azure's own "not found": a 404 for any other reason (e.g. an unknown API route) keeps the general error.
    if (error instanceof ApiError && error.reason === "AZURE_NOT_FOUND") {
      return (
        <NotFoundCard
          title={`Ticket #${id} doesn't exist or you can't see it`}
          text="It may have been deleted or moved to another project, or your token can't see it."
          backTo={`/azure/${encodeURIComponent(credentialId)}`}
          backLabel="Back to My work"
        />
      );
    }
    return <ErrorCard error={error} credentialId={credentialId} onRetry={() => void refetch()} isRetrying={isFetching} />;
  }

  const base = `/azure/${encodeURIComponent(credentialId)}`;
  const compliance = workItem.compliance;
  // SOP shows at the top only when something is needed; otherwise its details wait in a tab.
  const sopNeeded = compliance.configured && (compliance.violations.length > 0 || compliance.todos.length > 0);
  const family = workItem.family.data;
  const comments = workItem.comments.data;
  // The forms the ticket offers (a state change needs another state, a work log needs a supported field).
  const availablePanels = new Set<ActionPanel>([
    "comment",
    "pr",
    ...(workItem.allowedStates.some((candidate) => candidate.name !== workItem.state) ? (["state"] as const) : []),
    ...(Object.values(workItem.supportedFields).some(Boolean) ? (["fields"] as const) : []),
  ]);

  const sopPanel = (
    <SopResultPanel
      result={compliance}
      ai={{
        configured: ai.configured,
        check: ai.check,
        rev: workItem.rev,
        onRecheck: ai.recheck,
        isRechecking: ai.isRechecking,
        currentProvider: ai.currentProvider,
        enqueueError: ai.enqueueError,
        loadError: ai.resultsError,
        settingsLoading: ai.settingsLoading,
        isProposing: review.isProposing,
        onUseFix: (_result, fix) =>
          review.propose({
            credentialId,
            source: "AI_SUGGESTION",
            target: { projectId: workItem.projectName, workItemId: workItem.id },
            ...fixToAction(fix),
          }),
      }}
      renderAction={(violation) => {
        const suggestion = violation.suggestedAction;
        if (!suggestion) return null;
        if (!suggestion.requiresInput) {
          return (
            <Button
              size="sm"
              disabled={review.isProposing}
              onClick={() =>
                review.propose({
                  credentialId,
                  kind: suggestion.kind as ActionKind,
                  source: "RECOMMENDATION",
                  target: suggestion.target,
                  params: suggestion.params,
                })
              }
            >
              Review: {actionKindLabel(suggestion.kind)}
            </Button>
          );
        }
        const opens = PANEL_FOR_KIND[suggestion.kind];
        return opens && availablePanels.has(opens) ? (
          <Button size="sm" variant="secondary" onClick={() => setPanel(opens)}>
            {actionKindLabel(suggestion.kind)}…
          </Button>
        ) : (
          <a href={workItem.webUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-500">
            Fix in Azure DevOps
            <ExternalLink aria-hidden="true" className="size-3.5" />
          </a>
        );
      }}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      {error ? <StaleDataBanner credentialId={credentialId} error={error} onRetry={() => void refetch()} isRetrying={isFetching} /> : null}

      <Card className="p-5">
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
        <h2 className="mt-2 break-words text-xl font-semibold tracking-tight text-balance text-slate-950 sm:text-2xl">
          <span className="text-slate-500">#{workItem.id}</span> {workItem.title}
        </h2>
        {family ? <ParentLine base={base} family={family} /> : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <WorkItemTypeBadge type={workItem.type} />
          <WorkItemStateBadge state={workItem.state} category={workItem.stateCategory} />
          <PriorityBadge priority={workItem.priority} />
          {workItem.blocked ? <StatusBadge tone="danger">Blocked</StatusBadge> : null}
          {workItem.tags.map((tag) => (
            <StatusBadge key={tag} tone="neutral" dot={false}>
              {tag}
            </StatusBadge>
          ))}
          <span className="text-xs text-slate-500">changed {formatRelative(workItem.changedDate)}</span>
          <span className="flex items-center gap-1 sm:ml-auto">
            <Button size="sm" variant="ghost" onClick={() => void refetch()} disabled={isFetching} title="Read this ticket again from Azure DevOps">
              {isFetching ? <Spinner className="size-3.5" /> : null}
              {isFetching ? "Updating…" : "Refresh"}
            </Button>
            <a href={workItem.webUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-indigo-600 hover:bg-indigo-50 hover:text-indigo-500">
              Open in Azure DevOps
              <ExternalLink aria-hidden="true" className="size-3.5" />
            </a>
          </span>
        </div>
        <div className="mt-4 border-t border-slate-100 pt-4">
          <WorkItemActions
            // Another ticket starts fresh forms; a new revision of this one updates them without losing typed text.
            key={workItem.id}
            credentialId={credentialId}
            workItem={workItem}
            isProposing={review.isProposing}
            onPropose={review.propose}
            open={panel}
            onOpenChange={setPanel}
          />
        </div>
      </Card>

      {/* Priority is the P badge above, so it has no tile of its own. */}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Field label="Assigned to" value={workItem.assignedTo?.displayName ?? "Unassigned"} />
        <Field label="Original estimate" value={workItem.originalEstimate} hours />
        <Field label="Completed" value={workItem.completedWork} hours />
        <Field label="Remaining" value={workItem.remainingWork} hours />
        <Field label="Story points / effort" value={workItem.storyPoints ?? workItem.effort} optional />
        <Field label="Iteration" value={workItem.iterationPath} optional />
      </dl>

      {sopNeeded ? (
        <SectionCard title="SOP: needs attention" help="Checked against your SOP rules (the default rules plus your own changes). Each gap has a fix you can review before anything is written.">
          {sopPanel}
        </SectionCard>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3 [&>*]:min-w-0">
        <div className="lg:col-span-2">
          <SectionCard title="Description">
            {workItem.description || workItem.reproSteps ? (
              <p className="max-w-[75ch] whitespace-pre-wrap text-sm leading-6 text-slate-700">{workItem.description || workItem.reproSteps}</p>
            ) : (
              <EmptyState>No description.</EmptyState>
            )}
            {workItem.acceptanceCriteria ? (
              <>
                <h3 className="mt-5 text-sm font-semibold text-slate-900">Acceptance criteria</h3>
                <p className="mt-1 max-w-[75ch] whitespace-pre-wrap text-sm leading-6 text-slate-700">{workItem.acceptanceCriteria}</p>
              </>
            ) : null}
          </SectionCard>
        </div>

        <div className="flex flex-col gap-6">
          {family && (family.myChildren.length > 0 || family.otherChildren > 0) ? (
            <SectionCard title="Your items under it" help="Tickets under this one that are assigned to you; other people's are only counted.">
              {family.myChildren.length > 0 ? (
                <ul className="space-y-2 text-sm">
                  {family.myChildren.map((child) => (
                    <li key={child.id} className="flex items-center justify-between gap-2">
                      <TicketLink base={base} ticket={child} />
                      <WorkItemStateBadge state={child.state} category={child.stateCategory} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">None of the items under it are assigned to you.</p>
              )}
              {family.otherChildren > 0 ? (
                <p className="mt-3 text-xs text-slate-500">
                  {family.otherChildren} more by others ·{" "}
                  <a href={workItem.webUrl} target="_blank" rel="noreferrer" className="font-medium text-indigo-600 hover:text-indigo-500">
                    see them in Azure DevOps
                  </a>
                </p>
              ) : null}
            </SectionCard>
          ) : null}
          {workItem.family.status === "error" ? (
            <p className="text-xs text-amber-700">The story above this ticket and the items under it could not be read from Azure DevOps.</p>
          ) : null}

          <SectionCard title="Linked pull requests">
            <SectionView section={workItem.linkedPullRequests} label="linked pull requests">
              {(pullRequests) =>
                pullRequests.length === 0 ? (
                  <p className="text-sm text-slate-500">None linked.</p>
                ) : (
                  <ul className="space-y-2">
                    {pullRequests.map((pr) => (
                      <li key={`${pr.repositoryId}:${pr.pullRequestId}`} className="flex items-center justify-between gap-2 text-sm">
                        <Link
                          to={`${base}/projects/${encodeURIComponent(pr.projectId)}/repos/${encodeURIComponent(pr.repositoryId)}/pull-requests/${pr.pullRequestId}`}
                          className="min-w-0 break-words font-medium text-slate-900 hover:text-indigo-600"
                        >
                          PR {pr.pullRequestId} {pr.title ?? "(unavailable)"}
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
        </div>
      </div>

      <TicketTimePanel
        azureCredentialId={credentialId}
        ticket={{ id: workItem.id, title: workItem.title, projectName: workItem.projectName }}
        onPropose={(input) => review.propose(input)}
        isProposing={review.isProposing}
      />

      <Card className="p-5">
        <Tabs value={tab === "sop" && sopNeeded ? "comments" : tab} onValueChange={setTab} className="gap-4">
          <TabsList variant="line" aria-label="Ticket details">
            <ActiveIndicator variant="underline" />
            <TabsTrigger value="comments">Comments{comments && comments.length > 0 ? ` (${comments.length})` : ""}</TabsTrigger>
            <TabsTrigger value="history">Work log</TabsTrigger>
            {sopNeeded ? null : <TabsTrigger value="sop">SOP checks</TabsTrigger>}
          </TabsList>

          <TabsContent value="comments">
            <SectionView section={workItem.comments} label="comments">
              {(list) =>
                list.length === 0 ? (
                  <EmptyState>No comments yet.</EmptyState>
                ) : (
                  <ul className="space-y-3">
                    {list.map((comment) => (
                      <li key={comment.id} className="rounded-lg border border-slate-100 p-3">
                        <p className="text-xs text-slate-500">
                          {comment.createdBy.displayName} · {formatDateTime(comment.createdDate)}
                        </p>
                        <p className="mt-1 max-w-[75ch] whitespace-pre-wrap text-sm text-slate-800">{comment.text}</p>
                      </li>
                    ))}
                  </ul>
                )
              }
            </SectionView>
          </TabsContent>

          <TabsContent value="history">
            <PartialReadNotice
              className="mb-3"
              messages={[workItem.historyTruncated ? "This ticket has a very long history; part of the middle of it is not shown." : null]}
            />
            <SectionView section={workItem.history} label="history">
              {(history) =>
                history.length === 0 ? (
                  <EmptyState>No work log updates yet.</EmptyState>
                ) : (
                  <ul className="space-y-1.5 text-sm">
                    {history.slice(0, 20).map((change, index) => (
                      <li key={index} className="flex flex-wrap justify-between gap-x-2 gap-y-0.5">
                        <span className="text-slate-700">
                          {HISTORY_FIELDS[change.field]?.label ?? change.field}:{" "}
                          {withHours(change.oldValue, HISTORY_FIELDS[change.field]?.hours ?? false)} →{" "}
                          <span className="font-medium">{withHours(change.newValue, HISTORY_FIELDS[change.field]?.hours ?? false)}</span>
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
          </TabsContent>

          {sopNeeded ? null : <TabsContent value="sop">{sopPanel}</TabsContent>}
        </Tabs>
      </Card>

      <ActionReviewDialog action={review.reviewing} onClose={review.closeReview} />
      <ErrorToast message={review.proposeError} onDismiss={review.clearProposeError} />
    </div>
  );
}
