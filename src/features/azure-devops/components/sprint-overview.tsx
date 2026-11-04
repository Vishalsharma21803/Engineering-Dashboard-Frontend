import { RefreshCw } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { cn } from "@/utils/cn";
import type { MyWorkOverview, WorkSection } from "../types/azure.types";
import { formatRelative } from "../utils/format";
import { StatusIcon } from "./status-icon";

/** Monday–Friday days from `from` to `to` (both days counted). */
function workingDays(from: Date, to: Date): number {
  let count = 0;
  const day = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  while (day <= end) {
    if (day.getDay() !== 0 && day.getDay() !== 6) count += 1;
    day.setDate(day.getDate() + 1);
  }
  return count;
}

/**
 * Azure sends sprint days as midnight UTC ("2026-11-13T00:00:00Z" is the 13th everywhere).
 * Read the calendar day, not the instant, so the day is the same in every time zone.
 */
function sprintDay(value: string): Date {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(year!, month! - 1, day!);
}

const hours = (value: number) => `${Math.round(value * 10) / 10} h`;

interface SprintOverviewProps {
  overview: MyWorkOverview | null;
  /** My work could not be loaded (no access or an error), so there is nothing to sum up. */
  unavailable?: boolean;
  sprintMode: "current" | "all" | null;
  /** Hours a working day (Solidtime's daily target when linked), for "available". */
  hoursPerDay: number;
  hoursPerDayIsDefault: boolean;
  /** The notifications button: what needs action outside the list (reviews, failed runs, approvals, time, closed tickets). */
  notifications: ReactNode;
  generatedAt: string;
  onRefresh: () => void;
  isRefreshing: boolean;
  onSection: (section: WorkSection) => void;
  now?: Date;
}

const SEGMENTS: Array<{ key: WorkSection; label: string; className: string }> = [
  { key: "done", label: "done", className: "bg-indigo-600" },
  { key: "resolved", label: "resolved", className: "bg-indigo-400" },
  { key: "inProgress", label: "in progress", className: "bg-amber-400" },
  { key: "todo", label: "to do", className: "bg-slate-200" },
];

/**
 * The big picture above My work: the sprint in one sentence, one bar of where
 * my tickets stand (with a tick for how much of the sprint has passed), and
 * the hours left against the working hours left. Calm by default: color only
 * when behind or over.
 */
export function SprintOverview({ overview, unavailable = false, sprintMode, hoursPerDay, hoursPerDayIsDefault, notifications, generatedAt, onRefresh, isRefreshing, onSection, now: fixedNow }: SprintOverviewProps) {
  // "Today" is taken once per mount, not on every render.
  const [mountedAt] = useState(() => new Date());
  const now = fixedNow ?? mountedAt;
  const counts = overview?.counts;
  const total = counts ? counts.done + counts.resolved + counts.inProgress + counts.todo : 0;
  const sprint = overview?.sprint ?? null;
  const start = sprint?.startDate ? sprintDay(sprint.startDate) : null;
  const finish = sprint?.finishDate ? sprintDay(sprint.finishDate) : null;
  // Today counts as a day left; weekends count for nothing.
  const daysLeft = finish ? workingDays(now, finish) : null;
  const sprintDays = start && finish ? workingDays(start, finish) : 0;
  // Share of the sprint's working days already behind me (0 on the first morning, never 100% before the last day is over).
  const elapsed = sprintDays > 0 && daysLeft !== null ? Math.min(1, Math.max(0, (sprintDays - daysLeft) / sprintDays)) : null;
  const finished = counts ? counts.done + counts.resolved : 0;
  const share = total > 0 ? finished / total : 0;
  const available = daysLeft !== null ? daysLeft * hoursPerDay : null;
  const remaining = overview?.remainingHours ?? 0;
  const over = available !== null && remaining > available;
  // Behind when the finished share trails the time that has passed by more than a sixth.
  const behind = elapsed !== null && total > 0 && share + 1 / 6 < elapsed;

  const title = sprint ? sprint.name : sprintMode === "current" ? "Current sprints" : "All your work";
  const when =
    sprint && finish && daysLeft !== null
      ? daysLeft === 0
        ? `ended ${finish.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}`
        : `${daysLeft} working day${daysLeft === 1 ? "" : "s"} left · ends ${finish.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}`
      : null;

  return (
    <section aria-label="Sprint overview" className="rounded-xl border border-slate-200 bg-surface px-5 py-4 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight text-slate-950">{title}</h2>
          <p className="text-sm text-slate-500">
            {when ?? (overview ? `${total} ticket${total === 1 ? "" : "s"} assigned to you` : unavailable ? "Your tickets could not be loaded, so there is no summary." : "Loading your work…")}
            {behind ? <span className="font-medium text-amber-700"> · behind: {Math.round(share * 100)}% finished, {Math.round((elapsed ?? 0) * 100)}% of the sprint gone</span> : null}
            {!behind && elapsed !== null && total > 0 ? <span className="text-slate-500"> · on track</span> : null}
          </p>
        </div>
        {overview ? (
          <div className="text-right">
            <p className="text-2xl font-semibold tracking-tight text-slate-950 tabular-nums">
              {hours(remaining)} <span className="text-sm font-normal text-slate-500">left</span>
            </p>
            {available !== null ? (
              <Hint label={hoursPerDayIsDefault ? `At ${hoursPerDay} h a working day (link Solidtime to use your own daily target)` : `At your ${hoursPerDay} h daily target`}>
                <p className={cn("cursor-default text-xs tabular-nums", over ? "font-medium text-rose-700" : "text-slate-500")}>
                  {over ? `${hours(remaining - available)} more than the ${hours(available)} you have left` : `of ${hours(available)} you have left`}
                </p>
              </Hint>
            ) : null}
          </div>
        ) : null}
      </div>

      {counts && total > 0 ? (
        <div className="mt-3">
          <div className="relative">
            <div aria-hidden="true" className="flex h-2 overflow-hidden rounded-full bg-slate-100">
              {SEGMENTS.map((segment) =>
                counts[segment.key] > 0 ? <span key={segment.key} className={segment.className} style={{ width: `${(counts[segment.key] / total) * 100}%` }} /> : null
              )}
            </div>
            {elapsed !== null ? (
              <Hint label={`Today: ${Math.round(elapsed * 100)}% of the sprint has passed`}>
                <span className="absolute -top-1 h-4 w-0.5 -translate-x-1/2 cursor-default rounded-full bg-slate-700" style={{ left: `${elapsed * 100}%` }}>
                  <span className="sr-only">Today</span>
                </span>
              </Hint>
            ) : null}
          </div>
          <p className="sr-only">
            {finished} of {total} tickets finished.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            {(["inProgress", "todo", "resolved", "done"] as const).map((key) =>
              counts[key] > 0 ? (
                <button
                  key={key}
                  type="button"
                  onClick={() => onSection(key)}
                  className="inline-flex items-center gap-1.5 rounded px-0.5 text-xs text-slate-600 outline-none hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  <StatusIcon category={key === "inProgress" ? "InProgress" : key === "todo" ? "Proposed" : key === "resolved" ? "Resolved" : "Completed"} className="size-3.5" />
                  <span className="font-semibold text-slate-900 tabular-nums">{counts[key]}</span>{" "}
                  {SEGMENTS.find((segment) => segment.key === key)!.label}
                </button>
              ) : null
            )}
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
        {notifications}
        <span className="flex items-center gap-2 text-xs text-slate-500">
          Updated {formatRelative(generatedAt)}
          <Button size="sm" variant="ghost" onClick={onRefresh} disabled={isRefreshing} aria-label="Refresh from Azure">
            <RefreshCw aria-hidden="true" className={cn("size-4", isRefreshing && "animate-spin")} />
            <span className="hidden sm:inline">{isRefreshing ? "Refreshing…" : "Refresh"}</span>
          </Button>
        </span>
      </div>
    </section>
  );
}
