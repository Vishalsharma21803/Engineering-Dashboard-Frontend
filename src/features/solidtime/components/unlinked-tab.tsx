import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState, ErrorCard, SkeletonRows } from "@/features/azure-devops/components/feedback";
import type { ProposeActionInput } from "@/features/azure-devops/types/action.types";
import { formatDateTime } from "@/features/azure-devops/utils/format";
import { retryUnlessClientError } from "@/features/azure-devops/utils/query-retry";
import { usePageParam, useSyncServedPage } from "@/hooks/use-page-param";
import { getUnlinked } from "../api/solidtime.api";
import { solidtimeKeys } from "../api/solidtime.keys";
import type { SolidtimeConnection, TimesheetEntry } from "../types/solidtime.types";
import { formatDuration, shiftDay } from "../utils/time";

function FixDescription({ connection, entry, onPropose, isProposing }: { connection: SolidtimeConnection; entry: TimesheetEntry; onPropose: (input: ProposeActionInput) => void; isProposing: boolean }) {
  const [text, setText] = useState(entry.description ?? "");

  return (
    <form
      className="flex gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        onPropose({ credentialId: connection.credentialId, kind: "SOLIDTIME_ENTRY_UPDATE", target: { entryId: entry.id, entryStart: entry.start }, params: { description: text.trim() || null } });
      }}
    >
      <Input aria-label={`Description for the entry at ${formatDateTime(entry.start)}`} className="h-8 text-xs" value={text} onChange={(event) => setText(event.target.value)} placeholder="#21786 Ticket title" />
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
  const list = useQuery({
    queryKey: [...solidtimeKeys.unlinked(connection.credentialId), { from, to, page: pageParam.page }],
    queryFn: () => getUnlinked(connection.credentialId, { from, to, page: pageParam.page }),
    placeholderData: keepPreviousData,
    retry: retryUnlessClientError,
  });
  useSyncServedPage(pageParam, list.data && !list.isPlaceholderData ? list.data.page : undefined);

  if (list.isLoading) return <SkeletonRows rows={3} />;
  if (list.error || !list.data) return <ErrorCard error={list.error} onRetry={() => void list.refetch()} />;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-slate-600">
        Entries from {from} to {to} without a ticket number. Add the number (e.g. #21786) so the time counts for the ticket.
      </p>
      {!list.data.ticketsChecked ? <p className="text-xs text-amber-700">Ticket numbers could not be checked against Azure DevOps; only entries with no number at all are listed.</p> : null}
      {list.data.total === 0 ? (
        <EmptyState>Every entry names a ticket.</EmptyState>
      ) : (
        <ul aria-label="Entries without a ticket" className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {list.data.items.map((entry) => (
            <li key={entry.id} className="flex flex-col gap-1.5 px-3 py-2">
              <p className="text-xs text-slate-500">
                {formatDateTime(entry.start)} · {formatDuration(entry.seconds)}
                {entry.projectName ? ` · ${entry.projectName}` : ""}
              </p>
              <FixDescription connection={connection} entry={entry} onPropose={onPropose} isProposing={isProposing} />
            </li>
          ))}
        </ul>
      )}
      <Pagination label="Unlinked entry pages" page={list.data.page} totalPages={list.data.totalPages} total={list.data.total} pageSize={list.data.pageSize} disabled={list.isFetching} onChange={(next) => pageParam.setPage(next)} />
    </div>
  );
}
