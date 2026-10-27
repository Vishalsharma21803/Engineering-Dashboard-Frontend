import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState, ErrorCard, SkeletonRows, StatTile } from "@/features/azure-devops/components/feedback";
import { StatusBadge } from "@/features/azure-devops/components/status-badge";
import type { ProposeActionInput } from "@/features/azure-devops/types/action.types";
import { formatDateTime } from "@/features/azure-devops/utils/format";
import { retryUnlessClientError } from "@/features/azure-devops/utils/query-retry";
import { usePageParam, useSearchParamsUpdate, useSyncServedPage } from "@/hooks/use-page-param";
import { getTimesheet } from "../api/solidtime.api";
import { solidtimeKeys } from "../api/solidtime.keys";
import type { SolidtimeConnection, TimesheetEntry } from "../types/solidtime.types";
import { formatDuration, shiftDay, weekStart } from "../utils/time";
import { EntryForm } from "./entry-form";

interface TabProps {
  connection: SolidtimeConnection;
  onPropose: (input: ProposeActionInput) => void;
  isProposing: boolean;
  /** Today in my Solidtime time zone. */
  today: string;
}

/** My entries for a day or a week (my Solidtime time zone), with totals per day and per ticket. */
export function TimesheetTab({ connection, onPropose, isProposing, today }: TabProps) {
  const [mode, setMode] = useState<"day" | "week">("week");
  const [anchor, setAnchor] = useState(today);
  const [editing, setEditing] = useState<TimesheetEntry | "new" | null>(null);
  const entriesPage = usePageParam("entryPage");
  const ticketPage = usePageParam("ticketPage");
  const updateParams = useSearchParamsUpdate();
  const from = mode === "week" ? weekStart(anchor) : anchor;
  const to = mode === "week" ? shiftDay(from, 6) : anchor;
  const sheet = useQuery({
    queryKey: [...solidtimeKeys.timesheet(connection.credentialId), { from, to, page: entriesPage.page, ticketPage: ticketPage.page }],
    queryFn: () => getTimesheet(connection.credentialId, { from, to, page: entriesPage.page, ticketPage: ticketPage.page }),
    placeholderData: keepPreviousData,
    retry: retryUnlessClientError,
  });
  const served = sheet.data && !sheet.isPlaceholderData ? sheet.data : undefined;
  useSyncServedPage(entriesPage, served?.entries.page);
  useSyncServedPage(ticketPage, served?.byTicket.page);
  const move = (days: number) => {
    setAnchor(shiftDay(anchor, days));
    updateParams({ entryPage: null, ticketPage: null }, { replace: true });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Period" className="inline-flex rounded-lg border border-slate-200 p-0.5">
          {(["day", "week"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => {
                setMode(value);
                updateParams({ entryPage: null, ticketPage: null }, { replace: true });
              }}
              className={mode === value ? "rounded-md bg-inverse px-3 py-1 text-xs font-medium text-on-inverse" : "rounded-md px-3 py-1 text-xs font-medium text-slate-600"}
            >
              {value === "day" ? "Day" : "Week"}
            </button>
          ))}
        </div>
        <Button size="sm" variant="secondary" onClick={() => move(mode === "week" ? -7 : -1)} aria-label="Previous">
          ←
        </Button>
        <span className="text-sm font-medium text-slate-800">{from === to ? from : `${from} – ${to}`}</span>
        <Button size="sm" variant="secondary" onClick={() => move(mode === "week" ? 7 : 1)} aria-label="Next">
          →
        </Button>
        <Button size="sm" className="ml-auto" onClick={() => setEditing("new")}>
          Add entry
        </Button>
      </div>

      {editing === "new" ? <EntryForm connection={connection} onPropose={onPropose} isProposing={isProposing} onCancel={() => setEditing(null)} /> : null}

      {sheet.isLoading ? (
        <SkeletonRows rows={4} />
      ) : sheet.error || !sheet.data ? (
        <ErrorCard error={sheet.error} onRetry={() => void sheet.refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Tracked" value={formatDuration(sheet.data.totalSeconds)} hint={`time zone ${sheet.data.timeZone}`} />
            <StatTile label="Not linked to a ticket" value={formatDuration(sheet.data.unlinkedSeconds)} />
            <StatTile label="Tickets" value={sheet.data.byTicket.total} />
            <StatTile label="Target" value={`${connection.dailyTargetHours} h`} hint="per working day" />
          </div>

          {mode === "week" ? (
            <ul aria-label="Time per day" className="grid grid-cols-7 gap-1 text-center text-xs">
              {sheet.data.days.map((day) => (
                <li key={day.day} className={day.seconds / 3600 >= connection.dailyTargetHours ? "rounded-md bg-emerald-50 p-2 text-emerald-800" : "rounded-md bg-slate-50 p-2 text-slate-600"}>
                  <span className="block font-medium">{day.day.slice(5)}</span>
                  {formatDuration(day.seconds)}
                </li>
              ))}
            </ul>
          ) : null}

          {!sheet.data.ticketsChecked ? (
            <p className="text-xs text-amber-700">Ticket numbers were not checked against Azure DevOps (no organization linked, or it could not be read).</p>
          ) : null}

          <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
            <div>
              {sheet.data.entries.total === 0 ? (
                <EmptyState>No time in this period.</EmptyState>
              ) : (
                <ul aria-label="Time entries" className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {sheet.data.entries.items.map((entry) => (
                    <li key={entry.id} className="flex flex-col gap-2 px-3 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="min-w-0 text-sm text-slate-800">
                          <span className="font-medium tabular-nums">{formatDuration(entry.seconds)}</span> · {entry.description ?? "(no description)"}
                          {entry.running ? (
                            <>
                              {" "}
                              <StatusBadge tone="success">running</StatusBadge>
                            </>
                          ) : null}
                        </span>
                        <span className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setEditing(editing !== null && editing !== "new" && editing.id === entry.id ? null : entry)}>
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={isProposing}
                            onClick={() => onPropose({ credentialId: connection.credentialId, kind: "SOLIDTIME_ENTRY_DELETE", target: { entryId: entry.id, entryStart: entry.start }, params: {} })}
                          >
                            Delete…
                          </Button>
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">
                        {formatDateTime(entry.start)}
                        {entry.end ? ` – ${formatDateTime(entry.end)}` : ""}
                        {entry.projectName ? ` · ${entry.projectName}` : ""}
                        {entry.tickets.length ? ` · ${entry.tickets.map((ticket) => `#${ticket.id}`).join(", ")}` : " · no ticket"}
                      </p>
                      {editing !== null && editing !== "new" && editing.id === entry.id ? (
                        <EntryForm connection={connection} entry={entry} onPropose={onPropose} isProposing={isProposing} onCancel={() => setEditing(null)} />
                      ) : null}
                    </li>
                  ))}
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
            </div>
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Per ticket</h3>
              {sheet.data.byTicket.total === 0 ? (
                <p className="text-sm text-slate-500">No ticket numbers in this period.</p>
              ) : (
                <ul aria-label="Time per ticket" className="space-y-1 text-sm">
                  {sheet.data.byTicket.items.map((ticket) => (
                    <li key={ticket.ticketId} className="flex justify-between gap-2">
                      <span className="min-w-0 truncate text-slate-700">
                        #{ticket.ticketId} {ticket.title}
                      </span>
                      <span className="shrink-0 tabular-nums text-slate-900">{formatDuration(ticket.seconds)}</span>
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
            </div>
          </div>
        </>
      )}
    </div>
  );
}
