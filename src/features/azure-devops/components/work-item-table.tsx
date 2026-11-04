import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  AlertOctagon,
  AlertTriangle,
  BookMarked,
  Bug,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  Clock,
  Crown,
  FileText,
  FlaskConical,
  FolderKanban,
  GitPullRequest,
  ListFilter,
  Search,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { Hint } from "@/components/ui/hint";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SelectField } from "@/components/ui/select-field";
import { Updating } from "@/components/ui/updating";
import { usePageParam, useSyncServedPage } from "@/hooks/use-page-param";
import { cn } from "@/utils/cn";
import { getTicketTimes } from "@/features/solidtime/api/solidtime.api";
import { solidtimeKeys } from "@/features/solidtime/api/solidtime.keys";
import { TicketTimerButton } from "@/features/solidtime/components/ticket-timer-button";
import type { SolidtimeConnection } from "@/features/solidtime/types/solidtime.types";
import { formatDuration } from "@/features/solidtime/utils/time";
import type { ActionKind, ProposeActionInput } from "../types/action.types";
import { getMyWorkPage, getTeamWorkPage } from "../api/azure.api";
import { azureKeys } from "../api/azure.keys";
import type { DashboardTriage } from "../hooks/use-triage";
import type {
  Attention,
  ComplianceResult,
  IdentityRef,
  MyWorkOverview,
  PullRequestSummary,
  StateCategory,
  StoryProgress,
  WorkItemGroup,
  WorkItemListFilters,
  WorkItemSummary,
  WorkSection,
} from "../types/azure.types";
import { formatRelative, pluralizeText } from "../utils/format";
import { actionKindLabel } from "../utils/labels";
import { retryUnlessClientError } from "../utils/query-retry";
import { readStored, writeStored } from "../utils/stored";
import { UNTRIAGED, workItemKey } from "../utils/triage";
import { EmptyState, ErrorCard, SkeletonRows, StaleDataBanner } from "./feedback";
import { StatusIcon } from "./status-icon";
import { HiddenToggle, TriageBadge, TriageMenu } from "./triage-menu";

const EMPTY_WORK_ITEM_FILTERS: WorkItemListFilters = {
  search: "",
  type: "",
  stateCategory: "",
  priority: "",
  sop: "",
  assignee: "",
};

const SEARCH_DELAY_MS = 300;

/* ------------------------------------------------------------ keyboard */

/** J and K move the focus to the next or previous ticket in the list (outside text fields). */
function useRowKeys(container: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || (event.key !== "j" && event.key !== "k")) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.closest("[role=dialog],[role=menu],[role=listbox]"))) return;
      const links = [...(container.current?.querySelectorAll<HTMLElement>("[data-row-link]") ?? [])];
      if (links.length === 0) return;
      const index = links.indexOf(document.activeElement as HTMLElement);
      const next = event.key === "j" ? Math.min(links.length - 1, index + 1) : Math.max(0, index === -1 ? 0 : index - 1);
      event.preventDefault();
      links[next]?.focus();
      links[next]?.scrollIntoView({ block: "nearest" });
    }

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [container]);
}

/* ------------------------------------------------------------ glyphs */

const TYPE_ICONS: Record<string, LucideIcon> = {
  "User Story": BookMarked,
  "Product Backlog Item": BookMarked,
  Requirement: BookMarked,
  Bug,
  Task: ClipboardList,
  Feature: Trophy,
  Epic: Crown,
  Issue: CircleAlert,
  "Test Case": FlaskConical,
};

/** The ticket type as a quiet grey glyph (Azure DevOps' own shapes: bookmark story, bug, clipboard task, trophy feature, crown epic). */
function TypeIcon({ type }: { type: string }) {
  const Icon = TYPE_ICONS[type] ?? FileText;
  return (
    <Hint label={type}>
      <span className="inline-flex size-4 shrink-0 cursor-default items-center justify-center text-slate-400">
        <Icon aria-hidden="true" className="size-4" strokeWidth={1.75} />
        <span className="sr-only">{type}</span>
      </span>
    </Hint>
  );
}

/** The state as a status circle; its name on hover and for screen readers. */
function StateIcon({ category, state }: { category: StateCategory; state: string }) {
  return (
    <Hint label={state}>
      <span className="inline-flex shrink-0 cursor-default">
        <StatusIcon category={category} />
        <span className="sr-only">{state}</span>
      </span>
    </Hint>
  );
}

function personName(person: IdentityRef | null, myId: string | null): string {
  if (!person) return "Unassigned";
  return person.id === myId ? "You" : person.displayName;
}

function NewDot() {
  return (
    <Hint label="Changed since your last visit">
      <span className="inline-flex size-3 shrink-0 cursor-default items-center justify-center">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-indigo-500" />
        <span className="sr-only">Changed since your last visit</span>
      </span>
    </Hint>
  );
}

const ticketPath = (credentialId: string, projectName: string, id: number) =>
  `/azure/${encodeURIComponent(credentialId)}/projects/${encodeURIComponent(projectName)}/work-items/${id}`;

const hoursText = (hours: number | null | undefined) => (hours === null || hours === undefined ? "" : `${Math.round(hours * 100) / 100} h`);

/* ------------------------------------------------------------ what a ticket needs */

interface Problem {
  tone: "danger" | "warning" | "neutral";
  /** In full, for the hint (the ticket page lists each SOP gap with its fix). */
  text: string;
  /** Short tag on the row; SOP gaps share one tag. */
  tag: string;
  sop?: boolean;
}

const STALE_REASON = /^No updates in (\d+) working days$/;
const NO_TIME_REASON = /tracked no time|no time tracked/i;
const plain = (text: string) => text.replace(/\.$/, "");

/** A ticket's problems, most serious first (blocked and overdue before missing steps). Every reason is kept. */
function problemsOf(item: WorkItemSummary, compliance: ComplianceResult | null, attention: Attention | null): Problem[] {
  const gaps = compliance?.configured ? compliance.violations : [];
  const reasons = (attention?.reasons ?? []).map(pluralizeText);
  const problems: Problem[] = [];
  if (item.blocked) problems.push({ tone: "danger", text: "Blocked", tag: "Blocked" });
  for (const reason of reasons) {
    if (/^Overdue/i.test(reason)) problems.push({ tone: "danger", text: reason, tag: "Overdue" });
    else if (/^Due /i.test(reason)) problems.push({ tone: "warning", text: reason, tag: "Due soon" });
  }
  for (const gap of gaps) problems.push({ tone: "warning", text: plain(pluralizeText(gap.message)), tag: "SOP", sop: true });
  const stale = reasons.map((reason) => STALE_REASON.exec(reason)).find(Boolean);
  if (stale) problems.push({ tone: "neutral", text: `No update for ${stale[1]} days`, tag: `No update ${stale[1]}d` });
  // A time reminder on the ticket. (Its other reasons are SOP gaps, shown from its SOP result above, which may be newer.)
  const noTime = reasons.find((reason) => NO_TIME_REASON.test(reason));
  if (noTime) problems.push({ tone: "neutral", text: plain(noTime), tag: "No time today" });
  return problems;
}

const PROBLEM_ICONS = { danger: AlertOctagon, warning: AlertTriangle, neutral: Clock } as const;
const TAG_TONES = {
  danger: "bg-rose-50 text-rose-700 ring-rose-200",
  warning: "bg-amber-50 text-amber-800 ring-amber-200",
  neutral: "bg-slate-100 text-slate-600 ring-slate-200",
} as const;

/**
 * Small tags for what a ticket needs: every SOP gap shares one "SOP issue" tag, the rest are a word or two.
 * The full list is in the hint; the ticket page lists each gap with its fix.
 */
const MAX_TAGS = 2;

function ProblemTags({ problems }: { problems: Problem[] }) {
  if (problems.length === 0) return null;
  const sop = problems.filter((problem) => problem.sop);
  const tags: Array<{ key: string; tone: Problem["tone"]; label: string }> = [];
  for (const problem of problems) {
    if (problem.sop) {
      if (problem === sop[0]) tags.push({ key: "sop", tone: "warning", label: sop.length === 1 ? "SOP issue" : `${sop.length} SOP issues` });
    } else if (!tags.some((tag) => tag.label === problem.tag)) {
      tags.push({ key: problem.text, tone: problem.tone, label: problem.tag });
    }
  }
  return (
    <Hint
      label={
        <span className="block max-w-72">
          {problems.map((problem) => problem.text).join(" · ")}
          {sop.length > 0 ? <span className="mt-1 block opacity-80">Open the ticket to see each SOP issue and its fix.</span> : null}
        </span>
      }
    >
      <span className="inline-flex min-w-0 shrink-0 cursor-default items-center gap-1">
        {tags.slice(0, MAX_TAGS).map((tag, index) => {
          const Icon = PROBLEM_ICONS[tag.tone];
          return (
            // Phones keep the title readable: only the first tag's icon shows there.
            <span key={tag.key} className={cn("items-center gap-0.5 whitespace-nowrap rounded px-1 text-[10.5px] font-medium leading-4 ring-1 ring-inset", TAG_TONES[tag.tone], index === 0 ? "inline-flex" : "hidden sm:inline-flex")}>
              <Icon aria-hidden="true" className="size-3 shrink-0" />
              <span className="hidden sm:inline">{tag.label}</span>
            </span>
          );
        })}
        {tags.length > MAX_TAGS ? <span className="hidden whitespace-nowrap text-[10.5px] font-medium text-slate-500 sm:inline">+{tags.length - MAX_TAGS}</span> : null}
        <span className="sr-only">{problems.map((problem) => problem.text).join(". ")}</span>
      </span>
    </Hint>
  );
}

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

interface ListGroup extends WorkItemGroup<TicketRow> {
  section: WorkSection | null;
  progress: StoryProgress | null;
}

const SECTION_LABELS: Record<WorkSection, { label: string; category: StateCategory }> = {
  inProgress: { label: "In progress", category: "InProgress" },
  todo: { label: "To do", category: "Proposed" },
  resolved: { label: "Resolved", category: "Resolved" },
  done: { label: "Done recently", category: "Completed" },
};

interface RowContext {
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
const COLUMNS = "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 sm:grid-cols-[minmax(0,1fr)_4.5rem_9.5rem_6.5rem_7.5rem]";

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
  return (
    <span title={details.join(" · ") || undefined} className="hidden text-right text-xs tabular-nums text-slate-600 sm:block">
      {item.stateCategory === "Completed" || item.stateCategory === "Resolved" ? "" : hoursText(item.remainingWork)}
    </span>
  );
}

function TicketRowItem({ context, row, nested }: { context: RowContext; row: TicketRow; nested: boolean }) {
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
          <Hint label="Priority 1">
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
    <Hint label={`${progress.done} of your ${progress.total} tickets under it are resolved or done`}>
      <span className="inline-flex shrink-0 cursor-default items-center gap-1.5 text-xs tabular-nums text-slate-500">
        <span aria-hidden="true" className="relative h-1.5 w-10 overflow-hidden rounded-full bg-slate-200">
          <span className="absolute inset-y-0 left-0 rounded-full bg-indigo-500" style={{ width: `${Math.round(share * 100)}%` }} />
        </span>
        {progress.done}/{progress.total}
      </span>
    </Hint>
  );
}

function GroupHeadingRow({ context, group, open, onToggle }: { context: RowContext; group: ListGroup; open: boolean; onToggle: () => void }) {
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
          <Link
            data-row-link
            to={ticketPath(credentialId, heading.projectName, heading.id)}
            title={`${heading.state} · ${title}`}
            className="min-w-0 truncate rounded text-sm font-semibold text-slate-950 outline-none hover:text-indigo-700 focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <span className="font-normal text-slate-500 tabular-nums">{heading.id}</span> {heading.title}
          </Link>
        ) : (
          <span className="text-sm text-slate-500">Story #{heading.id} (could not be read from Azure DevOps)</span>
        )}
        {heading.readable ? (
          <span className={cn("shrink-0 whitespace-nowrap text-xs", owner === "You" ? "text-indigo-700" : "text-slate-500")}>
            {owner === "You" ? "Assigned to you" : heading.assignedTo ? `Assigned to ${owner}` : "Unassigned"}
          </span>
        ) : null}
        {row && isNew(row.item) ? <NewDot /> : null}
        {group.progress ? <ProgressBar progress={group.progress} /> : null}
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

interface GroupedTicketsProps {
  label: string;
  groups: ListGroup[];
  context: RowContext;
  /** Remembered collapsed stories. */
  collapsedKey: string;
  /** Ticket counts per section (from all pages), for the section headers. */
  sectionCounts?: Map<WorkSection, number> | undefined;
  /** The folded "Done recently" row at the end. */
  done?: { count: number; open: boolean; onToggle: () => void } | undefined;
  /** All projects at once: inside each status section, stories sit under their project's name. */
  byProject?: boolean | undefined;
}

const groupProject = (group: ListGroup) => group.heading?.projectName ?? group.rows[0]?.item.projectName ?? "";

/** Within each status section, the groups of one project together, in the order each project first appears (so newest change first, still). */
function inProjectOrder(groups: ListGroup[]): ListGroup[] {
  const sorted: ListGroup[] = [];
  let start = 0;
  while (start < groups.length) {
    let end = start;
    while (end < groups.length && groups[end]!.section === groups[start]!.section) end += 1;
    const run = groups.slice(start, end);
    const projects = [...new Set(run.map(groupProject))];
    for (const project of projects) sorted.push(...run.filter((group) => groupProject(group) === project));
    start = end;
  }
  return sorted;
}

/** Tickets grouped like Azure's backlog, in status sections (sticky headers with counts), stories inside. */
function GroupedTickets({ label, groups: listed, context, collapsedKey, sectionCounts, done, byProject = false }: GroupedTicketsProps) {
  const groups = byProject ? inProjectOrder(listed) : listed;
  const [collapsed, setCollapsed] = useState<number[]>(() => readStored<number[]>(collapsedKey, []));
  const list = useRef<HTMLUListElement>(null);
  useRowKeys(list);

  const toggle = (id: number) => {
    const next = collapsed.includes(id) ? collapsed.filter((value) => value !== id) : [...collapsed, id];
    setCollapsed(next);
    writeStored(collapsedKey, next.slice(-200));
  };

  const items: ReactNode[] = [];
  groups.forEach((group, index) => {
    const previous = groups[index - 1];
    // Folded "Done recently" is drawn by its own row below; when open, its groups follow it.
    if (group.section && group.section !== previous?.section && group.section !== "done") {
      const section = SECTION_LABELS[group.section];
      items.push(
        <li key={`s:${group.section}`} id={`section-${group.section}`} className="sticky top-[7.375rem] z-[5] mt-3 scroll-mt-32 md:top-16 md:scroll-mt-20 flex items-center gap-2 bg-surface/95 px-2 py-2 backdrop-blur first:mt-0">
          <StatusIcon category={section.category} />
          <h3 className="text-xs font-semibold tracking-wide text-slate-700 uppercase">{section.label}</h3>
          <span className="text-xs tabular-nums text-slate-500">{sectionCounts?.get(group.section) ?? ""}</span>
        </li>
      );
    }
    if (group.section === "done" && previous?.section !== "done" && done) {
      items.push(<DoneToggle key="s:done" done={done} />);
    }
    const project = groupProject(group);
    const newProject = byProject && (previous?.section !== group.section || groupProject(previous) !== project);
    if (newProject) {
      items.push(
        <li key={`p:${group.section}:${project}`} className="flex items-center gap-1.5 pb-0.5 pl-6 pr-2 pt-2">
          <FolderKanban aria-hidden="true" className="size-3.5 text-slate-400" />
          <h4 className="truncate text-xs font-medium text-slate-600">{project}</h4>
        </li>
      );
    }

    if (!group.heading) {
      // Consecutive tickets under no story share one quiet label.
      const startsRun = index === 0 || newProject || previous?.heading !== null || previous?.section !== group.section;
      items.push(
        <li key={`o:${group.section}:${group.rows[0]?.item.id ?? index}`}>
          {startsRun ? <p className="pb-0.5 pl-6 pr-2 pt-1 text-xs text-slate-500">Not under a story</p> : null}
          <ul>
            {group.rows.map((row) => (
              <TicketRowItem key={row.item.id} context={context} row={row} nested={false} />
            ))}
          </ul>
        </li>
      );
      return;
    }

    const open = !collapsed.includes(group.heading.id);
    items.push(
      <li key={`h:${group.section}:${group.heading.id}`}>
        <GroupHeadingRow context={context} group={group} open={open} onToggle={() => toggle(group.heading!.id)} />
        {open && group.rows.length > 0 ? (
          // A thin guide line, like the tree in Azure's backlog.
          <ul aria-label={`Under #${group.heading.id}`} className="ml-2.5 border-l border-slate-200 pl-2">
            {group.rows.map((row) => (
              <TicketRowItem key={row.item.id} context={context} row={row} nested />
            ))}
          </ul>
        ) : null}
      </li>
    );
  });
  // Folded (no done groups listed), the toggle closes the list.
  if (done && done.count > 0 && !groups.some((group) => group.section === "done")) items.push(<DoneToggle key="s:done" done={done} />);

  return (
    <div>
      <div aria-hidden="true" className={cn("hidden border-b border-slate-200 pb-2 pl-2 text-xs font-medium text-slate-500 sm:grid", COLUMNS)}>
        <span className="pl-[4.25rem]">Work item</span>
        <span className="text-right">Hours left</span>
        <span>{context.team ? "Assigned to" : "Pull request"}</span>
        <span className="text-right">Updated</span>
        <span />
      </div>
      <ul ref={list} aria-label={label} className="mt-1 flex flex-col">
        {items}
      </ul>
    </div>
  );
}

function DoneToggle({ done }: { done: { count: number; open: boolean; onToggle: () => void } }) {
  return (
    <li id="section-done" className="mt-3 scroll-mt-32 md:scroll-mt-20">
      <button
        type="button"
        onClick={done.onToggle}
        aria-expanded={done.open}
        className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <StatusIcon category="Completed" />
        <span className="text-xs font-semibold tracking-wide text-slate-700 uppercase">Done recently</span>
        <span className="text-xs tabular-nums text-slate-500">{done.count}</span>
        <span className="ml-auto inline-flex items-center gap-1 text-xs text-slate-500">
          {done.open ? "Hide" : "Show"}
          <ChevronRight aria-hidden="true" className={cn("size-4 transition-transform duration-150", done.open && "rotate-90")} />
        </span>
      </button>
    </li>
  );
}

/* ------------------------------------------------------------ filters */

/** Filters in the page (remembered when `storageKey` is set); the search box waits for typing to pause. */
function useListFilters(onChange: () => void, storageKey?: string) {
  const [filters, setFilters] = useState<WorkItemListFilters>(() =>
    storageKey ? { ...EMPTY_WORK_ITEM_FILTERS, ...readStored<Partial<WorkItemListFilters>>(storageKey, {}), search: "" } : EMPTY_WORK_ITEM_FILTERS
  );
  const [searchInput, setSearchInput] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilters((current) => (current.search === searchInput.trim() ? current : { ...current, search: searchInput.trim() }));
    }, SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (storageKey) writeStored(storageKey, { ...filters, search: "" });
  }, [filters, storageKey]);

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

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg bg-slate-100 p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-md px-2.5 py-1 text-sm font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500",
            value === option.value ? "bg-surface text-slate-950 shadow-xs" : "text-slate-600 hover:text-slate-900"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

interface FilterOptionLike {
  value: string;
  label: string;
  count?: number;
}

/** Search stays on screen; the dropdown filters fold into one "Filter" button (with how many are on). */
function ListToolbar({
  list,
  definitions,
  extra,
}: {
  list: ReturnType<typeof useListFilters>;
  definitions: Array<{ id: keyof WorkItemListFilters; label: string; options: FilterOptionLike[] }>;
  extra?: ReactNode;
}) {
  const active = definitions.filter((definition) => list.filters[definition.id] !== "").length;
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
      <div className="relative min-w-0 flex-1 basis-48 sm:max-w-64">
        <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <Input type="search" aria-label="Search ID, title or tag" placeholder="Search ID, title or tag" value={list.searchInput} onChange={(event) => list.setSearchInput(event.target.value)} className="h-8 pl-8 text-sm" />
      </div>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500",
              active > 0 ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-surface text-slate-700 hover:bg-slate-50"
            )}
          >
            <ListFilter aria-hidden="true" className="size-4" />
            Filter{active > 0 ? ` · ${active}` : ""}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 space-y-3 p-3">
          {definitions.map((definition) => (
            <label key={definition.id} className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              {definition.label}
              <SelectField aria-label={definition.label} size="sm" value={list.filters[definition.id]} onValueChange={list.set(definition.id)}>
                <option value="">All</option>
                {definition.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                    {option.count !== undefined ? ` (${option.count})` : ""}
                  </option>
                ))}
              </SelectField>
            </label>
          ))}
          {extra}
          {active > 0 || list.searchInput ? (
            <button type="button" onClick={list.clear} className="text-xs font-medium text-indigo-700 hover:underline">
              Clear filters
            </button>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  );
}

/* ------------------------------------------------------------ My work */

interface MyWorkTableProps {
  credentialId: string;
  projectId: string | undefined;
  /** Changes whenever the dashboard reloads, so the page reloads with it. */
  dashboardToken: string;
  triage: DashboardTriage;
  /** Time tracking on the rows (Solidtime linked to this organization). */
  time?: { connection: SolidtimeConnection; onPropose: (input: ProposeActionInput) => void; isProposing: boolean } | undefined;
  /** Proposes a ticket's fix (opens the approval dialog). */
  fix: { onPropose: (input: ProposeActionInput) => void; isProposing: boolean };
  /** My open pull requests (the dashboard's), for the state shown on linked tickets. */
  pullRequests: PullRequestSummary[];
  lastVisit?: number | null | undefined;
  myId: string | null;
  /** The sprint and counts the list was built from, for the header above it. */
  /** Null when the list could not be loaded. */
  onOverview?: ((data: { overview: MyWorkOverview; sprintMode: "current" | "all" } | null) => void) | undefined;
  /** My tickets span more than one project (All projects selected): each status section splits them by project. */
  multipleProjects?: boolean | undefined;
}

interface ListView {
  sprint: "current" | "all" | undefined;
  closed: boolean;
  /** Only tickets that need something from me. */
  attention?: boolean;
  groupBy?: "status" | "story";
}

/** My tickets in status sections (stories inside), 10 groups per page, newest change first, filtered by the server. The page lives in the URL (?page=). */
export function MyWorkTable({ credentialId, projectId, dashboardToken, triage, time, fix, pullRequests, lastVisit, myId, onOverview, multipleProjects = false }: MyWorkTableProps) {
  const pageParam = usePageParam("page");
  const { page, setPage } = pageParam;
  const [showHidden, setShowHidden] = useState(false);
  const toFirstPage = () => setPage(1, { replace: true });
  const list = useListFilters(toFirstPage, `cockpit:my-work-filters:${credentialId}`);
  const viewKey = `cockpit:my-work-view:${credentialId}`;
  const [view, setViewState] = useState<ListView>(() => readStored<ListView>(viewKey, { sprint: undefined, closed: false }));
  const setView = (next: ListView) => {
    setViewState(next);
    writeStored(viewKey, next);
    toFirstPage();
  };
  const groupBy = view.groupBy ?? "status";

  // Triage marks change which tickets match, so they refresh the page too.
  const query = useQuery({
    queryKey: [...azureKeys.myWork(credentialId, projectId ?? "all"), { page, showHidden, filters: list.filters, view, dashboardToken, triage: triage.savedVersion }],
    queryFn: () => getMyWorkPage(credentialId, { projectId, page, hidden: showHidden, filters: list.filters, sprint: view.sprint, closed: view.closed, attention: view.attention === true, groupBy }),
    placeholderData: keepPreviousData,
    retry: retryUnlessClientError,
  });
  useSyncServedPage(pageParam, query.isPlaceholderData ? undefined : query.data?.page);
  const pageIds = (query.data?.items ?? []).flatMap((group) => [...(group.headingRow ? [group.headingRow] : []), ...group.rows]).map((row) => row.workItem.id);
  const times = useQuery({
    queryKey: [...solidtimeKeys.ticketTimes(time?.connection.credentialId ?? ""), pageIds],
    queryFn: () => getTicketTimes(time?.connection.credentialId ?? "", pageIds),
    enabled: Boolean(time) && pageIds.length > 0,
    retry: retryUnlessClientError,
  });

  const overview = query.data?.overview;
  const sprintMode = query.data?.sprint.mode;
  const failed = !query.data && Boolean(query.error);
  useEffect(() => {
    if (overview && sprintMode) onOverview?.({ overview, sprintMode });
    else if (failed) onOverview?.(null);
  }, [overview, sprintMode, failed, onOverview]);

  if (query.isLoading) {
    return <SkeletonRows rows={5} />;
  }

  if (!query.data) {
    return <ErrorCard error={query.error} credentialId={credentialId} onRetry={() => void query.refetch()} />;
  }

  const stale = query.error ? <StaleDataBanner credentialId={credentialId} error={query.error} onRetry={() => void query.refetch()} isRetrying={query.isFetching} /> : null;
  const data = query.data;
  const sprintName = data.sprint.names.length === 1 ? data.sprint.names[0]! : "Current sprint";

  if (data.poolTotal === 0 && data.hiddenCount === 0 && data.sprint.mode === "all" && data.closed.count === 0) {
    return (
      <>
        {stale}
        <EmptyState>Nothing is assigned to you in Azure DevOps right now. New tickets assigned to you show up here.</EmptyState>
      </>
    );
  }

  const context: RowContext = {
    credentialId,
    myId,
    team: false,
    triage,
    fix,
    time: time ? { ...time, tracked: new Map((times.data ?? []).map((entry) => [entry.ticketId, entry.mySeconds])) } : undefined,
    pullRequests: new Map(pullRequests.map((pr) => [pr.pullRequestId, pr])),
    isNew: (item) => lastVisit !== null && lastVisit !== undefined && item.changedDate !== null && Date.parse(item.changedDate) > lastVisit,
  };
  const groups: ListGroup[] = data.items.map((group) => ({
    heading: group.heading,
    latest: group.latest,
    section: group.section,
    progress: group.progress,
    headingRow: group.headingRow ? { item: group.headingRow.workItem, compliance: group.headingRow.compliance, attention: group.headingRow.attention } : null,
    rows: group.rows.map((row) => ({ item: row.workItem, compliance: row.compliance, attention: row.attention })),
  }));
  const doneCount = data.sections.find((section) => section.key === "done")?.count ?? 0;

  return (
    <>
      {stale}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label="Show"
            value={data.attention.only ? "attention" : "all"}
            options={[
              { value: "all", label: "All my work" },
              { value: "attention", label: `Needs attention · ${data.attention.count}` },
            ]}
            onChange={(value) => setView({ ...view, attention: value === "attention" })}
          />
          {data.sprint.inSprint > 0 || data.sprint.mode === "current" ? (
            <Segmented
              label="Sprint"
              value={data.sprint.mode}
              options={[
                { value: "current", label: sprintName },
                { value: "all", label: "All sprints" },
              ]}
              onChange={(sprint) => setView({ ...view, sprint })}
            />
          ) : null}
          <div className="flex w-full min-w-0 items-center justify-end sm:w-auto sm:flex-1">
            <ListToolbar
              list={list}
              definitions={[
                { id: "type", label: "Type", options: data.facets.types },
                { id: "stateCategory", label: "State", options: data.facets.states },
                { id: "priority", label: "Priority", options: data.facets.priorities },
                { id: "sop", label: "Checks", options: data.facets.sop },
              ]}
              extra={
                <div className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                  Group by
                  <Segmented
                    label="Group by"
                    value={groupBy}
                    options={[
                      { value: "status", label: "Status" },
                      { value: "story", label: "Story" },
                    ]}
                    onChange={(value) => setView({ ...view, groupBy: value })}
                  />
                </div>
              }
            />
          </div>
        </div>
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
          {data.total > 0 || doneCount > 0 ? (
            <GroupedTickets
              label="My work items"
              groups={groups}
              context={context}
              collapsedKey={`cockpit:collapsed:${credentialId}`}
              byProject={!projectId && (multipleProjects || new Set(groups.map(groupProject)).size > 1)}
              sectionCounts={new Map(data.sections.map((section) => [section.key, section.count]))}
              // The "Done recently" switch sits where done tickets start, or at the very end of the list (last page) when they are folded.
              done={
                !data.showingHidden && (data.page === data.totalPages || groups.some((group) => group.section === "done"))
                  ? { count: doneCount, open: view.closed, onToggle: () => setView({ ...view, closed: !view.closed }) }
                  : undefined
              }
            />
          ) : (
            <EmptyState>
              {data.poolTotal > 0 || data.showingHidden
                ? data.attention.only
                  ? "Nothing needs your attention. Everything assigned to you is on track."
                  : "No tickets match these filters. Clear them in Filter."
                : data.sprint.mode === "current"
                  ? `Nothing of yours is in ${sprintName}. Switch to All sprints to see the rest.`
                  : data.hiddenCount > 0
                    ? "All your open tickets are snoozed or abandoned."
                    : "No open tickets are assigned to you."}
            </EmptyState>
          )}
        </Updating>
        <Pagination
          label="My work pages"
          page={data.page}
          totalPages={data.totalPages}
          total={data.total}
          pageSize={data.pageSize}
          summary={`Page ${data.page} of ${data.totalPages}`}
          disabled={query.isFetching}
          onChange={(next) => setPage(next)}
        />
      </div>
    </>
  );
}

/* ------------------------------------------------------------ Team */

interface TeamWorkTableProps {
  credentialId: string;
  projectId: string;
  scope: "open" | "all";
  myId: string | null;
}

/** Everyone's tickets in a project grouped by story, 10 groups per page, filtered by the server. The page lives in the URL (?page=). */
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

  const context: RowContext = { credentialId, myId, team: true, pullRequests: new Map(), isNew: () => false };
  const groups: ListGroup[] = data.items.map((group) => ({
    heading: group.heading,
    latest: group.latest,
    section: null,
    progress: null,
    headingRow: group.headingRow ? { item: group.headingRow, compliance: null, attention: null } : null,
    rows: group.rows.map((item) => ({ item, compliance: null, attention: null })),
  }));

  return (
    <>
      {stale}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-slate-500" aria-live="polite">
            {data.ticketCount === data.poolTotal ? `${data.poolTotal} tickets` : `${data.ticketCount} of ${data.poolTotal} tickets`}
          </span>
          <ListToolbar
            list={list}
            definitions={[
              { id: "type", label: "Type", options: data.facets.types },
              { id: "stateCategory", label: "State", options: data.facets.states },
              { id: "priority", label: "Priority", options: data.facets.priorities },
              { id: "assignee", label: "Assignee", options: data.facets.assignees },
            ]}
          />
        </div>
        <Updating active={query.isPlaceholderData}>
          {data.total > 0 ? (
            <GroupedTickets label="Team work items" groups={groups} context={context} collapsedKey={`cockpit:team-collapsed:${credentialId}`} />
          ) : (
            <EmptyState>No work items match these filters. Clear them in Filter.</EmptyState>
          )}
        </Updating>
        <Pagination
          label="Team work item pages"
          page={data.page}
          totalPages={data.totalPages}
          total={data.total}
          pageSize={data.pageSize}
          summary={`Page ${data.page} of ${data.totalPages}`}
          disabled={query.isFetching}
          onChange={(next) => setPage(next)}
        />
      </div>
    </>
  );
}
