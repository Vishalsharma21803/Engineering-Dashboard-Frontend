import { ChevronRight, GitPullRequest } from "lucide-react";
import { Link } from "react-router-dom";

import { Hint } from "@/components/ui/hint";
import { cn } from "@/utils/cn";
import { TicketTimerButton } from "@/features/solidtime/components/ticket-timer-button";
import type { SolidtimeConnection } from "@/features/solidtime/types/solidtime.types";
import { formatDuration } from "@/features/solidtime/utils/time";
import type { ActionKind, ProposeActionInput } from "../../types/action.types";
import type { DashboardTriage } from "../../hooks/use-triage";
import type {
  Attention,
  ComplianceResult,
  IdentityRef,
  PullRequestSummary,
  StoryProgress,
  WorkItemGroup,
  WorkItemSummary,
  WorkSection,
} from "../../types/azure.types";
import { formatRelative } from "../../utils/format";
import { actionKindLabel } from "../../utils/labels";
import { UNTRIAGED, workItemKey } from "../../utils/triage";
import { TriageBadge, TriageMenu } from "../triage-menu";
import { NewDot, StateIcon, TypeIcon } from "./glyphs";
import { ProblemTags } from "./problem-tags";
import { problemsOf } from "./problems";

function personName(person: IdentityRef | null, myId: string | null): string {
  if (!person) return "Unassigned";
  return person.id === myId ? "You" : person.displayName;
}

const ticketPath = (credentialId: string, projectName: string, id: number) =>
  `/azure/${encodeURIComponent(credentialId)}/projects/${encodeURIComponent(projectName)}/work-items/${id}`;

const hoursText = (hours: number | null | undefined) => (hours === null || hours === undefined ? "" : `${Math.round(hours * 100) / 100} h`);

/** The pull request a ticket is linked to, in a word: the state that tells you what happens next. */
function PullRequestState({ item, credentialId, pullRequests }: { item: WorkItemSummary; credentialId: string; pullRequests: Map<number, PullRequestSummary> }) {
  const link = item.links.pullRequests[0];
  if (!link) return null;
  const pr = pullRequests.get(link.pullRequestId);
  const state = !pr
    ? { text: `PR ${link.pullRequestId}`, tone: "text-slate-500" }
    : pr.isDraft
      ? { text: "Draft", tone: "text-slate-500" }
      : pr.mergeStatus === "conflicts"
        ? { text: "Conflicts", tone: "text-rose-700" }
        : pr.rejections > 0
          ? { text: "Changes requested", tone: "text-amber-700" }
          : pr.approvals > 0
            ? { text: `${pr.approvals} approval${pr.approvals === 1 ? "" : "s"}`, tone: "text-emerald-700" }
            : { text: "In review", tone: "text-slate-600" };
  const more = item.links.pullRequests.length - 1;
  return (
    <Link
      to={`/azure/${encodeURIComponent(credentialId)}/projects/${encodeURIComponent(link.projectId)}/repos/${encodeURIComponent(link.repositoryId)}/pull-requests/${link.pullRequestId}`}
      title={pr ? `PR ${pr.pullRequestId} ${pr.title}` : `Pull request ${link.pullRequestId} (not one of yours, or already closed)`}
      className={cn("inline-flex min-w-0 items-center gap-1 rounded text-xs outline-none hover:underline focus-visible:ring-2 focus-visible:ring-indigo-500", state.tone)}
    >
      <GitPullRequest aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="truncate">{state.text}</span>
      {more > 0 ? <span className="shrink-0 text-slate-500">+{more}</span> : null}
    </Link>
  );
}

/* ------------------------------------------------------------ grouped list */

interface TicketRow {
  item: WorkItemSummary;
  compliance: ComplianceResult | null;
  attention: Attention | null;
}

export interface ListGroup extends WorkItemGroup<TicketRow> {
  section: WorkSection | null;
  progress: StoryProgress | null;
}

export interface RowContext {
  credentialId: string;
  myId: string | null;
  /** Team lists: whose ticket it is, in place of the pull request column. */
  team: boolean;
  triage?: DashboardTriage | undefined;
  fix?: { onPropose: (input: ProposeActionInput) => void; isProposing: boolean } | undefined;
  time?: { connection: SolidtimeConnection; onPropose: (input: ProposeActionInput) => void; isProposing: boolean; tracked: Map<number, number> } | undefined;
  pullRequests: Map<number, PullRequestSummary>;
  isNew: (item: WorkItemSummary) => boolean;
}

/** Work item · Hours · PR (or assignee) · Updated · actions: the same rail on every row, so the eye scans straight down. */
export const COLUMNS = "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 sm:grid-cols-[minmax(0,1fr)_4.5rem_9.5rem_6.5rem_7.5rem]";

/** Actions that are not the point of the row: shown on hover or keyboard focus (always on touch screens). */
const HOVER_ACTIONS =
  "flex shrink-0 items-center justify-end gap-1 opacity-0 transition-opacity duration-150 group-hover/row:opacity-100 group-focus-within/row:opacity-100 has-[[data-state=open]]:opacity-100 has-[[data-timer-running]]:opacity-100 [@media(hover:none)]:opacity-100";

function RowActions({ row, context }: { row: TicketRow; context: RowContext }) {
  const { item, attention } = row;
  const action = attention?.suggestedAction ?? null;
  const label = action ? `${actionKindLabel(action.kind)}…` : null;
  const triaged = context.triage ? context.triage.resolve(workItemKey(item.id), item.projectName) : UNTRIAGED;

  return (
    <div className={HOVER_ACTIONS}>
      {action && label ? (
        action.requiresInput || !context.fix ? (
          <Link
            to={ticketPath(context.credentialId, item.projectName, item.id)}
            aria-label={`${label} #${item.id}`}
            className="rounded-md px-1.5 py-1 text-xs font-semibold text-indigo-700 outline-none hover:bg-indigo-50 focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            Fix…
          </Link>
        ) : (
          <Hint label={label}>
            <button
              type="button"
              disabled={context.fix.isProposing}
              aria-label={`${label} #${item.id}`}
              onClick={() => context.fix?.onPropose({ credentialId: context.credentialId, kind: action.kind as ActionKind, source: "RECOMMENDATION", target: action.target, params: action.params })}
              className="rounded-md px-1.5 py-1 text-xs font-semibold text-indigo-700 outline-none hover:bg-indigo-50 focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50"
            >
              Fix…
            </button>
          </Hint>
        )
      ) : null}
      {context.time ? (
        <TicketTimerButton
          connection={context.time.connection}
          ticket={{ id: item.id, title: item.title, projectName: item.projectName }}
          onPropose={context.time.onPropose}
          disabled={context.time.isProposing}
          compact
        />
      ) : null}
      {context.triage ? <TriageMenu triage={context.triage} itemKey={workItemKey(item.id)} projectName={item.projectName} label={`#${item.id} ${item.title}`} resolved={triaged} /> : null}
    </div>
  );
}

function HoursCell({ item, context }: { item: WorkItemSummary; context: RowContext }) {
  const tracked = context.time?.tracked.get(item.id);
  const details = [
    item.remainingWork !== null ? `${hoursText(item.remainingWork)} remaining` : null,
    item.originalEstimate !== null ? `estimate ${hoursText(item.originalEstimate)}` : null,
    tracked !== undefined ? `${formatDuration(tracked)} tracked in Solidtime` : null,
  ].filter(Boolean);
  const cell = (
    <span className="hidden cursor-default text-right text-xs tabular-nums text-slate-600 sm:block">
      {item.stateCategory === "Completed" || item.stateCategory === "Resolved" ? "" : hoursText(item.remainingWork)}
    </span>
  );
  return details.length > 0 ? (
    <Hint label={details.join(" · ")} focusable>
      {cell}
    </Hint>
  ) : (
    cell
  );
}

export function TicketRowItem({ context, row, nested }: { context: RowContext; row: TicketRow; nested: boolean }) {
  const { credentialId, myId, team, triage, isNew } = context;
  const { item } = row;
  const triaged = triage ? triage.resolve(workItemKey(item.id), item.projectName) : UNTRIAGED;
  const finished = item.stateCategory === "Completed" || item.stateCategory === "Removed";
  const problems = finished ? [] : problemsOf(item, row.compliance, row.attention);
  const assignee = personName(item.assignedTo, myId);

  return (
    <li className={cn("group/row rounded-md transition-colors hover:bg-slate-50 focus-within:bg-slate-50", COLUMNS, "min-h-10 py-1.5 pr-1", nested ? "pl-5" : "pl-6", (triaged.state !== "active" || finished) && "opacity-70")}>
      <div className="flex min-w-0 items-center gap-2">
        <StateIcon category={item.stateCategory} state={item.state} />
        <TypeIcon type={item.type} />
        <Link
          data-row-link
          to={ticketPath(credentialId, item.projectName, item.id)}
          title={`${item.state} · #${item.id} ${item.title}`}
          className={cn("min-w-0 truncate rounded text-sm outline-none hover:text-indigo-700 focus-visible:ring-2 focus-visible:ring-indigo-500", finished ? "text-slate-500" : "text-slate-900")}
        >
          <span className="text-slate-500 tabular-nums">{item.id}</span> {item.title}
        </Link>
        {isNew(item) ? <NewDot /> : null}
        {item.priority === 1 && !finished ? (
          <Hint label="Priority 1" focusable>
            <span className="shrink-0 cursor-default rounded bg-rose-600 px-1 text-[10px] font-bold leading-4 text-white">P1</span>
          </Hint>
        ) : null}
        <TriageBadge resolved={triaged} />
        <ProblemTags problems={problems} />
      </div>
      <HoursCell item={item} context={context} />
      <div className="hidden min-w-0 sm:block">
        {team ? (
          <span className={cn("block truncate text-xs", assignee === "Unassigned" ? "text-slate-400" : "text-slate-600")}>{assignee}</span>
        ) : (
          <PullRequestState item={item} credentialId={credentialId} pullRequests={context.pullRequests} />
        )}
      </div>
      <span className="hidden text-right text-xs tabular-nums text-slate-500 sm:block">{item.changedDate ? formatRelative(item.changedDate) : ""}</span>
      <RowActions row={row} context={context} />
    </li>
  );
}

/** "1/3" with a short bar: how far my tickets under the story are. */
function ProgressBar({ progress }: { progress: StoryProgress }) {
  if (progress.total === 0) return null;
  const share = progress.done / progress.total;
  return (
    <Hint label={`${progress.done} of your ${progress.total} tickets under it are resolved or done`} focusable>
      <span className="inline-flex shrink-0 cursor-default items-center gap-1.5 text-xs tabular-nums text-slate-500">
        <span aria-hidden="true" className="relative h-1.5 w-10 overflow-hidden rounded-full bg-slate-200">
          <span className="absolute inset-y-0 left-0 rounded-full bg-indigo-500" style={{ width: `${Math.round(share * 100)}%` }} />
        </span>
        {progress.done}/{progress.total}
      </span>
    </Hint>
  );
}

export function GroupHeadingRow({ context, group, open, onToggle }: { context: RowContext; group: ListGroup; open: boolean; onToggle: () => void }) {
  const { credentialId, myId, isNew } = context;
  const heading = group.heading!;
  const row = group.headingRow;
  const owner = personName(heading.assignedTo, myId);
  const title = heading.readable ? `#${heading.id} ${heading.title}` : `#${heading.id}`;
  const count = group.rows.length;
  // A closed story's gaps are in the notifications, like a closed ticket's.
  const finished = row !== null && (row.item.stateCategory === "Completed" || row.item.stateCategory === "Removed");
  const problems = row && !finished ? problemsOf(row.item, row.compliance, row.attention) : [];

  return (
    <div className={cn("group/row rounded-md transition-colors hover:bg-slate-50", COLUMNS, "min-h-10 py-1.5 pr-1 pl-0")}>
      <div className="flex min-w-0 items-center gap-2">
        {count > 0 ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-label={`${open ? "Collapse" : "Expand"} ${title}`}
            className="-mr-1 inline-flex size-5 shrink-0 items-center justify-center rounded text-slate-400 outline-none hover:bg-slate-200 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <ChevronRight aria-hidden="true" className={cn("size-4 transition-transform duration-150", open && "rotate-90")} />
          </button>
        ) : (
          <span className="-mr-1 size-5 shrink-0" aria-hidden="true" />
        )}
        {heading.readable ? <StateIcon category={heading.stateCategory} state={heading.state} /> : null}
        {heading.readable ? <TypeIcon type={heading.type} /> : null}
        {heading.readable ? (
          // Phones: the owner and progress go on a line under the title, so the title keeps its width.
          <span className="flex min-w-0 flex-col sm:contents">
            <Link
              data-row-link
              to={ticketPath(credentialId, heading.projectName, heading.id)}
              title={`${heading.state} · ${title}`}
              className="min-w-0 truncate rounded text-sm font-semibold text-slate-950 outline-none hover:text-indigo-700 focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <span className="font-normal text-slate-500 tabular-nums">{heading.id}</span> {heading.title}
            </Link>
            <span className="truncate text-xs text-slate-500 sm:hidden">
              {heading.assignedTo ? owner : "Unassigned"}
              {group.progress && group.progress.total > 0 ? ` · ${group.progress.done}/${group.progress.total} done` : ""}
            </span>
          </span>
        ) : (
          <span className="text-sm text-slate-500">Story #{heading.id} (could not be read from Azure DevOps)</span>
        )}
        {heading.readable ? (
          <span className={cn("hidden shrink-0 whitespace-nowrap text-xs sm:inline", owner === "You" ? "text-indigo-700" : "text-slate-500")}>
            {owner === "You" ? "Assigned to you" : heading.assignedTo ? `Assigned to ${owner}` : "Unassigned"}
          </span>
        ) : null}
        {row && isNew(row.item) ? <NewDot /> : null}
        {group.progress ? (
          <span className="hidden sm:inline-flex">
            <ProgressBar progress={group.progress} />
          </span>
        ) : null}
        <ProblemTags problems={problems} />
      </div>
      <span className="hidden text-right text-xs tabular-nums text-slate-600 sm:block" title={group.progress ? "Hours left on your tickets under this story" : undefined}>
        {group.progress && group.progress.remainingHours > 0 ? hoursText(group.progress.remainingHours) : ""}
      </span>
      <span className="hidden sm:block" />
      {/* The group's newest change (the order of the list), not only the story's own edits. */}
      <span className="hidden text-right text-xs tabular-nums text-slate-500 sm:block" title={group.latest ? "Last change to your tickets in this story" : undefined}>
        {group.latest ?? heading.changedDate ? formatRelative((group.latest ?? heading.changedDate)!) : ""}
      </span>
      {row ? <RowActions row={row} context={context} /> : <span />}
    </div>
  );
}
