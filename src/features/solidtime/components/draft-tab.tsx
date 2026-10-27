import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, ErrorCard, SkeletonRows } from "@/features/azure-devops/components/feedback";
import type { ProposeActionInput } from "@/features/azure-devops/types/action.types";
import { formatDateTime } from "@/features/azure-devops/utils/format";
import { retryUnlessClientError } from "@/features/azure-devops/utils/query-retry";
import { getDraft } from "../api/solidtime.api";
import { solidtimeKeys } from "../api/solidtime.keys";
import { useCatalog } from "../hooks/use-solidtime";
import type { DayDraft, DraftRow, SolidtimeConnection } from "../types/solidtime.types";
import { fromLocalInput, shiftDay, toLocalInput } from "../utils/time";

const SELECT = "h-8 rounded-md border border-slate-300 bg-white px-2 text-xs";

interface Editable {
  include: boolean;
  description: string;
  projectId: string;
  start: string;
  end: string;
}

function editableFrom(row: DraftRow): Editable {
  return {
    include: row.hours !== null && row.hours > 0 && row.start !== null,
    description: row.description,
    projectId: row.solidtimeProjectId ?? "",
    start: row.start ? toLocalInput(row.start) : "",
    end: row.end ? toLocalInput(row.end) : "",
  };
}

/**
 * Draft a day from Azure DevOps: tickets I changed that day, hours from my
 * Completed Work increases (minus what Solidtime already has), placed without
 * overlaps. Review, adjust, then propose the whole day for one approval.
 */
export function DraftTab({ connection, onPropose, isProposing, today }: { connection: SolidtimeConnection; onPropose: (input: ProposeActionInput) => void; isProposing: boolean; today: string }) {
  const [day, setDay] = useState(today);
  const catalog = useCatalog(connection.credentialId);
  const draft = useQuery({
    queryKey: solidtimeKeys.draft(connection.credentialId, day),
    queryFn: () => getDraft(connection.credentialId, day),
    retry: retryUnlessClientError,
  });
  const initial = useMemo(() => Object.fromEntries((draft.data?.rows ?? []).map((row) => [row.ticketId, editableFrom(row)])) as Record<number, Editable>, [draft.data]);
  // Edits belong to the draft they were made on; a new draft starts from its own suggestions.
  const [edits, setEdits] = useState<{ source: DayDraft | undefined; rows: Record<number, Editable> }>({ source: undefined, rows: {} });
  const rows = edits.source === draft.data && draft.data !== undefined ? edits.rows : initial;

  const chosen = (draft.data?.rows ?? []).filter((row) => rows[row.ticketId]?.include);
  const invalid = chosen.filter((row) => {
    const edit = rows[row.ticketId];
    const start = edit ? fromLocalInput(edit.start) : null;
    const end = edit ? fromLocalInput(edit.end) : null;
    return !start || !end || end <= start;
  });

  function propose() {
    onPropose({
      credentialId: connection.credentialId,
      kind: "SOLIDTIME_ENTRIES_CREATE",
      target: {},
      params: {
        entries: chosen.map((row) => {
          const edit = rows[row.ticketId]!;
          return { start: fromLocalInput(edit.start), end: fromLocalInput(edit.end), description: edit.description.trim() || null, projectId: edit.projectId || null, taskId: null, tags: [], billable: false };
        }),
      },
    });
  }

  const set = (ticketId: number, change: Partial<Editable>) => setEdits({ source: draft.data, rows: { ...rows, [ticketId]: { ...rows[ticketId]!, ...change } } });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          Day
          <Input type="date" className="h-9 w-40" value={day} min={shiftDay(today, -14)} max={today} onChange={(event) => event.target.value && setDay(event.target.value)} />
        </label>
        <p className="text-xs text-slate-500">Built from what you changed in Azure DevOps that day. Nothing is saved until you approve it.</p>
      </div>

      {draft.isLoading ? (
        <SkeletonRows rows={4} />
      ) : draft.error || !draft.data ? (
        <ErrorCard error={draft.error} onRetry={() => void draft.refetch()} />
      ) : draft.data.rows.length === 0 ? (
        <EmptyState>No Azure DevOps activity by you on {day}.</EmptyState>
      ) : (
        <>
          <ul aria-label="Drafted entries" className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {draft.data.rows.map((row) => {
              const edit = rows[row.ticketId];
              if (!edit) return null;

              return (
                <li key={row.ticketId} className="flex flex-col gap-2 px-3 py-3">
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-900">
                    <input type="checkbox" checked={edit.include} onChange={(event) => set(row.ticketId, { include: event.target.checked })} aria-label={`Include #${row.ticketId}`} />#{row.ticketId} {row.title}
                    <span className="text-xs font-normal text-slate-500">
                      · {row.hours === null ? "no Completed Work change: enter the time" : `${row.hours} h suggested`}
                      {row.alreadyTrackedHours ? ` (${row.alreadyTrackedHours} h already in Solidtime)` : ""}
                    </span>
                  </label>
                  <ul className="ml-6 text-xs text-slate-500">
                    {row.activity.map((item, index) => (
                      <li key={`${item.at}:${index}`}>
                        {formatDateTime(item.at)} · {item.what}
                      </li>
                    ))}
                  </ul>
                  {row.note ? <p className="ml-6 text-xs text-amber-700">{row.note}</p> : null}
                  <div className="ml-6 grid gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr]">
                    <Input aria-label={`Description for #${row.ticketId}`} className="h-8 text-xs" value={edit.description} onChange={(event) => set(row.ticketId, { description: event.target.value })} />
                    <select aria-label={`Project for #${row.ticketId}`} className={SELECT} value={edit.projectId} onChange={(event) => set(row.ticketId, { projectId: event.target.value })}>
                      <option value="">No project</option>
                      {(catalog.data?.projects ?? []).map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                    <Input aria-label={`Start for #${row.ticketId}`} type="datetime-local" className="h-8 text-xs" value={edit.start} onChange={(event) => set(row.ticketId, { start: event.target.value })} />
                    <Input aria-label={`End for #${row.ticketId}`} type="datetime-local" className="h-8 text-xs" value={edit.end} onChange={(event) => set(row.ticketId, { end: event.target.value })} />
                  </div>
                </li>
              );
            })}
          </ul>
          {draft.data.truncated ? <p className="text-xs text-amber-700">Only the 50 most recently changed tickets are shown.</p> : null}
          {invalid.length > 0 ? <p className="text-sm text-amber-700">Give every chosen ticket a start and an end after it.</p> : null}
          <div>
            <Button disabled={isProposing || chosen.length === 0 || invalid.length > 0} onClick={propose}>
              Propose {chosen.length} entr{chosen.length === 1 ? "y" : "ies"}…
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
