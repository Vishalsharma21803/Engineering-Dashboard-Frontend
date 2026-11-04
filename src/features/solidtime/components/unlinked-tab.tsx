import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Updating } from "@/components/ui/updating";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState, ErrorCard, SkeletonRows, StaleDataBanner } from "@/features/azure-devops/components/feedback";
import type { ProposeActionInput } from "@/features/azure-devops/types/action.types";
import { retryUnlessClientError } from "@/features/azure-devops/utils/query-retry";
import { usePageParam, useSyncServedPage } from "@/hooks/use-page-param";
import { getUnlinked } from "../api/solidtime.api";
import { solidtimeKeys } from "../api/solidtime.keys";
import type { SolidtimeConnection, TimesheetEntry } from "../types/solidtime.types";
import { useSolidtimeTimeZone } from "../hooks/use-solidtime";
import { formatDayLabel, formatDuration, localDay, shiftDay, zonedClock } from "../utils/time";

/** "Tue, Oct 27 · 09:00–10:30" in my Solidtime time zone. */
function when(entry: TimesheetEntry, timeZone: string): string {
  const day = formatDayLabel(localDay(new Date(entry.start), timeZone), { weekday: "short", day: "numeric", month: "short" });
  return `${day} · ${zonedClock(entry.start, timeZone)}–${entry.end ? zonedClock(entry.end, timeZone) : "now"}`;
}

function FixDescription({ connection, entry, label, onPropose, isProposing }: { connection: SolidtimeConnection; entry: TimesheetEntry; label: string; onPropose: (input: ProposeActionInput) => void; isProposing: boolean }) {
  const [text, setText] = useState(entry.description ?? "");

  return (
    <form
      className="flex gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        onPropose({ credentialId: connection.credentialId, kind: "SOLIDTIME_ENTRY_UPDATE", target: { entryId: entry.id, entryStart: entry.start }, params: { description: text.trim() || null } });
      }}
    >
      <Input aria-label={`Description for the entry on ${label}`} className="h-9 min-w-0 flex-1 text-sm" value={text} onChange={(event) => setText(event.target.value)} placeholder="#21786 Ticket title" />
      <Button size="sm" type="submit" disabled={isProposing || text.trim() === (entry.description ?? "")}>
        Fix…
      </Button>
    </form>
  );
}

/** My entries of the last 14 days whose description names no Azure ticket, so their time can be linked. */
export function UnlinkedTab({ connection, onPropose, isProposing, today }: { connection: SolidtimeConnection; onPropose: (input: ProposeActionInput) => void; isProposing: boolean; today: string }) {
  const to = today;
  const from = shiftDay(to, -13);
  const pageParam = usePageParam("unlinkedPage");
  // Without my Solidtime time zone, the browser's is used, as for "today" on the Time page.
  const timeZone = useSolidtimeTimeZone(connection.credentialId) ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const list = useQuery({
    queryKey: [...solidtimeKeys.unlinked(connection.credentialId), { from, to, page: pageParam.page }],
    queryFn: () => getUnlinked(connection.credentialId, { from, to, page: pageParam.page }),
    placeholderData: keepPreviousData,
    retry: retryUnlessClientError,
  });
  useSyncServedPage(pageParam, list.data && !list.isPlaceholderData ? list.data.page : undefined);

  if (list.isLoading) return <SkeletonRows rows={3} />;
  if (!list.data) return <ErrorCard error={list.error} onRetry={() => void list.refetch()} isRetrying={list.isFetching} />;

  return (
    <div className="flex flex-col gap-3">
      {list.error ? <StaleDataBanner error={list.error} onRetry={() => void list.refetch()} isRetrying={list.isFetching} /> : null}
      <p className="text-sm text-slate-600">
        Your entries from {formatDayLabel(from, { day: "numeric", month: "short" })} to {formatDayLabel(to, { day: "numeric", month: "short" })} that name no ticket. Name the ticket as #12345 (or any 4+ digit ticket number) so the time counts for it.
      </p>
      {!list.data.ticketsChecked ? <p className="text-xs text-amber-700">Ticket numbers could not be checked against Azure DevOps; only entries with no number at all are listed.</p> : null}
      <Updating active={list.isPlaceholderData}>
        {list.data.total === 0 ? (
          <EmptyState>Every entry names a ticket.</EmptyState>
        ) : (
          <ul aria-label="Entries without a ticket" className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-surface shadow-sm">
            {list.data.items.map((entry) => (
              <li key={entry.id} className="flex flex-col gap-2 p-4">
                <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="font-semibold tabular-nums text-slate-950">{formatDuration(entry.seconds)}</span>
                  <span className="text-slate-500">{when(entry, timeZone)}</span>
                  {entry.projectName ? <span className="text-slate-500">· {entry.projectName}</span> : null}
                </p>
                <FixDescription connection={connection} entry={entry} label={when(entry, timeZone)} onPropose={onPropose} isProposing={isProposing} />
              </li>
            ))}
          </ul>
        )}
      </Updating>
      <Pagination label="Unlinked entry pages" page={list.data.page} totalPages={list.data.totalPages} total={list.data.total} pageSize={list.data.pageSize} disabled={list.isFetching} onChange={(next) => pageParam.setPage(next)} />
    </div>
  );
}
