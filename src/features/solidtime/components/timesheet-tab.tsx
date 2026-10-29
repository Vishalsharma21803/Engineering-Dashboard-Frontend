import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Pagination } from "@/components/ui/pagination";
import { Spinner } from "@/components/ui/spinner";
import { Updating } from "@/components/ui/updating";
import { EmptyState, ErrorCard, SkeletonRows, StaleDataBanner, StatTile } from "@/features/azure-devops/components/feedback";
import { StatusBadge } from "@/features/azure-devops/components/status-badge";
import type { ProposeActionInput } from "@/features/azure-devops/types/action.types";
import { retryUnlessClientError } from "@/features/azure-devops/utils/query-retry";
import { usePageParam, useSearchParamsUpdate, useSyncServedPage } from "@/hooks/use-page-param";
import { cn } from "@/utils/cn";
import { getTimesheet } from "../api/solidtime.api";
import { solidtimeKeys } from "../api/solidtime.keys";
import type { SolidtimeConnection, TimesheetEntry } from "../types/solidtime.types";
import { formatDayLabel, formatDuration, shiftDay, weekStart, zonedClock } from "../utils/time";
import { EntryForm } from "./entry-form";

interface TabProps {
  connection: SolidtimeConnection;
  onPropose: (input: ProposeActionInput) => void;
  isProposing: boolean;
  /** Today in my Solidtime time zone. */
  today: string;
}

type Mode = "day" | "week";
type View = "entries" | "tickets";

const SEGMENT = "rounded-md px-3 py-1.5 text-sm font-medium transition";
const SEGMENT_ON = "bg-inverse text-on-inverse shadow-sm";
const SEGMENT_OFF = "text-slate-600 hover:text-slate-950";

function EntryRow({
  entry,
  timeZone,
  withDay,
  editing,
  onEdit,
  onDelete,
  deleteDisabled,
  children,
}: {
  entry: TimesheetEntry;
  timeZone: string;
  withDay: boolean;
  editing: boolean;
  onEdit: () => void;
  onDelete: () => void;
  deleteDisabled: boolean;
  children?: ReactNode;
}) {
  return (
    <li className="flex flex-col gap-3 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-4">
          <div className="w-24 shrink-0">
            <p className="text-lg font-semibold tabular-nums text-slate-950">{formatDuration(entry.seconds)}</p>
            <p className="text-xs tabular-nums text-slate-500">
              {zonedClock(entry.start, timeZone)} – {entry.end ? zonedClock(entry.end, timeZone) : "now"}
            </p>
          </div>
          <div className="min-w-0">
            <p className="break-words text-sm font-medium text-slate-900">
              {entry.description ?? <span className="italic text-slate-500">(no description)</span>}
              {entry.running ? (
                <span className="ml-2 align-middle">
                  <StatusBadge tone="success">running</StatusBadge>
                </span>
              ) : null}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
              {withDay ? <span className="text-slate-500">{formatDayLabel(zonedDayOf(entry.start, timeZone), { weekday: "short", day: "numeric", month: "short" })}</span> : null}
              {entry.projectName ? <StatusBadge tone="info" dot={false}>{entry.projectName}</StatusBadge> : null}
              {entry.tickets.length ? (
                // A ticket the description already starts with ("#102 Fix…") is not repeated as a chip.
                entry.tickets
                  .filter((ticket) => !(entry.description ?? "").trimStart().startsWith(`#${ticket.id}`))
                  .map((ticket) => (
                    <StatusBadge key={ticket.id} tone="neutral" dot={false}>
                      #{ticket.id}
                    </StatusBadge>
                  ))
              ) : (
                <StatusBadge tone="warning" dot={false}>
                  No ticket
                </StatusBadge>
              )}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="secondary" aria-expanded={editing} onClick={onEdit}>
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="size-4">
              <path d="m5.433 13.917 1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65Z" />
              <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0 0 10 3H4.75A2.75 2.75 0 0 0 2 5.75v9.5A2.75 2.75 0 0 0 4.75 18h9.5A2.75 2.75 0 0 0 17 15.25V10a.75.75 0 0 0-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5Z" />
            </svg>
            {editing ? "Close" : "Edit"}
          </Button>
          <Button size="sm" variant="secondary" className="text-rose-700 hover:bg-rose-50" disabled={deleteDisabled} onClick={onDelete}>
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="size-4">
              <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />
            </svg>
            Delete…
          </Button>
        </div>
      </div>
      {children}
    </li>
  );
}

/** The day (YYYY-MM-DD) an instant falls on in the time zone. */
function zonedDayOf(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

/**
 * My entries for a day or a week (my Solidtime time zone). In a week, each day
 * is a card: pick one to list its entries (or the whole week). Entries and the
 * per-ticket totals are separate views. While another period loads, the old one
 * is dimmed and cannot be edited.
 */
export function TimesheetTab({ connection, onPropose, isProposing, today }: TabProps) {
  const [mode, setMode] = useState<Mode>("week");
  const [anchor, setAnchor] = useState(today);
  /** The day whose entries are listed in week mode; null = the whole week. */
  const [pickedDay, setPickedDay] = useState<string | null>(today);
  const [view, setView] = useState<View>("entries");
  const [editing, setEditing] = useState<TimesheetEntry | "new" | null>(null);
  const entriesPage = usePageParam("entryPage");
  const ticketPage = usePageParam("ticketPage");
  const updateParams = useSearchParamsUpdate();
  const from = mode === "week" ? weekStart(anchor) : anchor;
  const to = mode === "week" ? shiftDay(from, 6) : anchor;
  // A picked day outside the shown week falls back to its first day.
  const listDay = mode === "day" ? anchor : pickedDay === null ? null : pickedDay >= from && pickedDay <= to ? pickedDay : from;
  const sheet = useQuery({
    queryKey: [...solidtimeKeys.timesheet(connection.credentialId), { from, to, day: listDay, page: entriesPage.page, ticketPage: ticketPage.page }],
    queryFn: () => getTimesheet(connection.credentialId, { from, to, ...(listDay && mode === "week" ? { day: listDay } : {}), page: entriesPage.page, ticketPage: ticketPage.page }),
    placeholderData: keepPreviousData,
    retry: retryUnlessClientError,
  });
  const stale = sheet.isPlaceholderData;
  const served = sheet.data && !stale ? sheet.data : undefined;
  useSyncServedPage(entriesPage, served?.entries.page);
  useSyncServedPage(ticketPage, served?.byTicket.page);

  const resetPages = () => updateParams({ entryPage: null, ticketPage: null }, { replace: true });
  const goTo = (day: string) => {
    setAnchor(day);
    setEditing(null);
    resetPages();
  };
  const pickDay = (day: string | null) => {
    setPickedDay(day);
    setEditing(null);
    updateParams({ entryPage: null }, { replace: true });
  };
  const step = mode === "week" ? 7 : 1;
  const unit = mode === "week" ? "week" : "day";
  const isCurrent = mode === "week" ? today >= from && today <= to : anchor === today;
  const timeZone = sheet.data?.timeZone ?? "UTC";
  const rangeLabel =
    mode === "week"
      ? `${formatDayLabel(from, { weekday: "short", day: "numeric", month: "short" })} – ${formatDayLabel(to, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}`
      : formatDayLabel(anchor, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3 p-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Period" className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            {(["day", "week"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={mode === value}
                onClick={() => {
                  setMode(value);
                  setEditing(null);
                  resetPages();
                }}
                className={cn(SEGMENT, mode === value ? SEGMENT_ON : SEGMENT_OFF)}
              >
                {value === "day" ? "Day" : "Week"}
              </button>
            ))}
          </div>
          <div className="inline-flex items-center gap-1">
            <Button size="sm" variant="secondary" aria-label={`Previous ${unit}`} onClick={() => goTo(shiftDay(anchor, -step))}>
              ←
            </Button>
            <Button size="sm" variant="secondary" disabled={isCurrent} onClick={() => goTo(today)}>
              {mode === "week" ? "This week" : "Today"}
            </Button>
            <Button size="sm" variant="secondary" aria-label={`Next ${unit}`} onClick={() => goTo(shiftDay(anchor, step))}>
              →
            </Button>
          </div>
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-900" aria-live="polite">
            {rangeLabel}
            {sheet.isFetching ? <Spinner className="size-4 text-indigo-600" /> : null}
          </p>
        </div>
        <Button size="sm" onClick={() => setEditing(editing === "new" ? null : "new")} aria-expanded={editing === "new"}>
          + Add entry
        </Button>
      </Card>

      {editing === "new" ? <EntryForm connection={connection} onPropose={onPropose} isProposing={isProposing} onCancel={() => setEditing(null)} timeZone={sheet.data?.timeZone ?? null} /> : null}

      {sheet.error && sheet.data ? <StaleDataBanner error={sheet.error} onRetry={() => void sheet.refetch()} isRetrying={sheet.isFetching} /> : null}

      {sheet.isLoading ? (
        <SkeletonRows rows={4} />
      ) : !sheet.data ? (
        <ErrorCard error={sheet.error} onRetry={() => void sheet.refetch()} isRetrying={sheet.isFetching} />
      ) : (
        <Updating active={stale} label={`Loading ${rangeLabel}…`} className="flex flex-col gap-4">
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile label={mode === "week" ? "Tracked this week" : "Tracked this day"} value={formatDuration(sheet.data.totalSeconds)} hint={`time zone ${sheet.data.timeZone}`} />
              <StatTile label="Not linked to a ticket" value={formatDuration(sheet.data.unlinkedSeconds)} />
              <StatTile label="Tickets" value={sheet.data.byTicket.total} />
              <StatTile label="Target" value={`${connection.dailyTargetHours} h`} hint="per working day" />
            </div>

            {mode === "week" ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">Days</h3>
                  <Button size="sm" variant={listDay === null ? "primary" : "secondary"} aria-pressed={listDay === null} onClick={() => pickDay(null)}>
                    Whole week
                  </Button>
                </div>
                <ul aria-label="Time per day" className="grid grid-cols-7 gap-1.5 sm:gap-2">
                  {sheet.data.days.map((day) => {
                    const hours = day.seconds / 3600;
                    const reached = hours >= connection.dailyTargetHours;
                    const picked = day.day === listDay;
                    return (
                      <li key={day.day}>
                        <button
                          type="button"
                          aria-pressed={picked}
                          aria-label={`${formatDayLabel(day.day, { weekday: "long", day: "numeric", month: "long" })}: ${formatDuration(day.seconds)}`}
                          onClick={() => pickDay(day.day)}
                          className={cn(
                            "flex w-full flex-col items-center gap-1 rounded-xl border px-1 py-2.5 text-center transition hover:border-indigo-300",
                            picked ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-500/20" : "border-slate-200 bg-surface",
                          )}
                        >
                          <span className={cn("text-[11px] font-semibold uppercase tracking-wide", day.day === today ? "text-indigo-600" : "text-slate-500")}>
                            {formatDayLabel(day.day, { weekday: "short" })}
                          </span>
                          <span className="text-lg font-semibold leading-none text-slate-950">{Number(day.day.slice(8))}</span>
                          <span className={cn("text-xs tabular-nums", day.seconds === 0 ? "text-slate-400" : reached ? "text-emerald-700" : "text-slate-700")}>
                            <span className="sm:hidden">{Math.round(hours * 10) / 10} h</span>
                            <span className="hidden sm:inline">{formatDuration(day.seconds)}</span>
                          </span>
                          <span className="mt-0.5 h-1 w-4/5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                            <span className={cn("block h-full rounded-full", reached ? "bg-emerald-500" : "bg-indigo-500")} style={{ width: `${Math.min(100, (hours / Math.max(connection.dailyTargetHours, 0.5)) * 100)}%` }} />
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            {!sheet.data.ticketsChecked ? (
              <p className="text-xs text-amber-700">Ticket numbers were not checked against Azure DevOps (no organization linked, or it could not be read).</p>
            ) : null}

            <div role="group" aria-label="Show" className="inline-flex w-fit rounded-lg border border-slate-200 bg-slate-50 p-0.5">
              <button type="button" aria-pressed={view === "entries"} onClick={() => setView("entries")} className={cn(SEGMENT, view === "entries" ? SEGMENT_ON : SEGMENT_OFF)}>
                Entries ({sheet.data.entries.total})
              </button>
              <button type="button" aria-pressed={view === "tickets"} onClick={() => setView("tickets")} className={cn(SEGMENT, view === "tickets" ? SEGMENT_ON : SEGMENT_OFF)}>
                By ticket ({sheet.data.byTicket.total})
              </button>
            </div>

            {view === "entries" ? (
              <section aria-labelledby="entries-title" className="flex flex-col gap-2">
                <h3 id="entries-title" className="text-sm font-semibold text-slate-900">
                  {mode === "day" ? "Entries" : listDay === null ? "Entries this week" : `Entries on ${formatDayLabel(listDay, { weekday: "long", day: "numeric", month: "long" })}`}
                </h3>
                {sheet.data.entries.total === 0 ? (
                  <EmptyState>{listDay ? "No time on this day." : "No time in this period."}</EmptyState>
                ) : (
                  <ul aria-label="Time entries" className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-surface shadow-sm">
                    {sheet.data.entries.items.map((entry) => {
                      const isEditing = editing !== null && editing !== "new" && editing.id === entry.id;
                      return (
                        <EntryRow
                          key={entry.id}
                          entry={entry}
                          timeZone={timeZone}
                          withDay={mode === "week" && listDay === null}
                          editing={isEditing}
                          onEdit={() => setEditing(isEditing ? null : entry)}
                          deleteDisabled={isProposing}
                          onDelete={() => onPropose({ credentialId: connection.credentialId, kind: "SOLIDTIME_ENTRY_DELETE", target: { entryId: entry.id, entryStart: entry.start }, params: {} })}
                        >
                          {isEditing ? <EntryForm connection={connection} entry={entry} onPropose={onPropose} isProposing={isProposing} onCancel={() => setEditing(null)} timeZone={timeZone} /> : null}
                        </EntryRow>
                      );
                    })}
                  </ul>
                )}
                <Pagination
                  label="Time entry pages"
                  page={sheet.data.entries.page}
                  totalPages={sheet.data.entries.totalPages}
                  total={sheet.data.entries.total}
                  pageSize={sheet.data.entries.pageSize}
                  disabled={sheet.isFetching}
                  onChange={(next) => entriesPage.setPage(next)}
                />
              </section>
            ) : (
              <section aria-labelledby="tickets-title" className="flex flex-col gap-2">
                <h3 id="tickets-title" className="text-sm font-semibold text-slate-900">
                  Time per ticket {mode === "week" ? "this week" : "this day"}
                </h3>
                {sheet.data.byTicket.total === 0 ? (
                  <EmptyState>No ticket numbers in this period.</EmptyState>
                ) : (
                  <ul aria-label="Time per ticket" className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-surface shadow-sm">
                    {sheet.data.byTicket.items.map((ticket) => (
                      <li key={ticket.ticketId} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                        <span className="min-w-0 truncate text-slate-800">
                          <span className="font-medium text-slate-950">#{ticket.ticketId}</span> {ticket.title}
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums text-slate-950">{formatDuration(ticket.seconds)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <Pagination
                  label="Per ticket pages"
                  page={sheet.data.byTicket.page}
                  totalPages={sheet.data.byTicket.totalPages}
                  total={sheet.data.byTicket.total}
                  pageSize={sheet.data.byTicket.pageSize}
                  disabled={sheet.isFetching}
                  onChange={(next) => ticketPage.setPage(next)}
                />
              </section>
            )}
          </div>
        </Updating>
      )}
    </div>
  );
}
