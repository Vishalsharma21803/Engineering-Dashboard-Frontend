import { ChevronRight, FolderKanban } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";

import { cn } from "@/utils/cn";
import type { StateCategory, WorkSection } from "../../types/azure.types";
import { readStored, writeStored } from "../../utils/stored";
import { StatusIcon } from "../status-icon";
import { COLUMNS, GroupHeadingRow, TicketRowItem, type ListGroup, type RowContext } from "./row-parts";
import { groupProject, inProjectOrder } from "./groups";
import { useRowKeys } from "./use-row-keys";

const SECTION_LABELS: Record<WorkSection, { label: string; category: StateCategory }> = {
  inProgress: { label: "In progress", category: "InProgress" },
  todo: { label: "To do", category: "Proposed" },
  resolved: { label: "Resolved", category: "Resolved" },
  done: { label: "Done recently", category: "Completed" },
};

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

/** Tickets grouped like Azure's backlog, in status sections (sticky headers with counts), stories inside. */
export function GroupedTickets({ label, groups: listed, context, collapsedKey, sectionCounts, done, byProject = false }: GroupedTicketsProps) {
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
