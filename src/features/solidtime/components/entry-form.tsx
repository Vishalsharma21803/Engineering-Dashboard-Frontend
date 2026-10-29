import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProposeActionInput } from "@/features/azure-devops/types/action.types";
import { useCatalog } from "../hooks/use-solidtime";
import type { SolidtimeConnection, TimesheetEntry } from "../types/solidtime.types";
import { fromLocalInput, fromZonedInput, toLocalInput, toZonedInput } from "../utils/time";
import { LoadErrorNotice } from "./load-error-notice";

const SELECT = "h-9 rounded-lg border border-slate-300 bg-surface px-2.5 text-sm shadow-sm";

interface EntryFormProps {
  connection: SolidtimeConnection;
  /** Editing this entry; omitted to add a new one. */
  entry?: TimesheetEntry | undefined;
  onPropose: (input: ProposeActionInput) => void;
  isProposing: boolean;
  onCancel: () => void;
  /** Times are shown and entered in this zone (my Solidtime one); without it, the browser's. */
  timeZone?: string | null | undefined;
}

/** Add or edit one entry (in local time). Proposes the change; nothing is saved until it is approved. */
export function EntryForm({ connection, entry, onPropose, isProposing, onCancel, timeZone = null }: EntryFormProps) {
  const catalog = useCatalog(connection.credentialId);
  const toInput = (iso: string) => (timeZone ? toZonedInput(iso, timeZone) : toLocalInput(iso));
  const fromInput = (value: string) => (timeZone ? fromZonedInput(value, timeZone) : fromLocalInput(value));
  const [description, setDescription] = useState(entry?.description ?? "");
  const [projectId, setProjectId] = useState(entry?.projectId ?? "");
  const [taskId, setTaskId] = useState(entry?.taskId ?? "");
  // New entries default to the last hour.
  const [start, setStart] = useState(() => toInput(entry?.start ?? new Date(Date.now() - 3_600_000).toISOString()));
  const [end, setEnd] = useState(() => (entry?.end ? toInput(entry.end) : entry ? "" : toInput(new Date().toISOString())));
  const [billable, setBillable] = useState(entry?.billable ?? false);
  const [error, setError] = useState<string | null>(null);
  const tasks = (catalog.data?.tasks ?? []).filter((task) => task.project_id === projectId);

  function submit(event: FormEvent) {
    event.preventDefault();
    const startIso = fromInput(start);
    const endIso = end ? fromInput(end) : null;

    if (!startIso || (!endIso && !entry?.running)) {
      setError("Enter a start and an end.");
      return;
    }

    if (endIso && endIso <= startIso) {
      setError("The end must be after the start.");
      return;
    }

    setError(null);
    const fields = { description: description.trim() || null, projectId: projectId || null, taskId: taskId || null, billable };

    if (entry) {
      // The inputs show minutes only: unchanged times are left exactly as they are.
      const startChanged = start !== toInput(entry.start);
      const endChanged = Boolean(endIso) && (!entry.end || end !== toInput(entry.end));
      onPropose({
        credentialId: connection.credentialId,
        kind: "SOLIDTIME_ENTRY_UPDATE",
        target: { entryId: entry.id, entryStart: entry.start },
        params: { ...fields, tags: entry.tags, ...(startChanged ? { start: startIso } : {}), ...(endChanged && endIso ? { end: endIso } : {}) },
      });
    } else {
      onPropose({ credentialId: connection.credentialId, kind: "SOLIDTIME_ENTRY_CREATE", target: {}, params: { ...fields, tags: [], start: startIso, end: endIso } });
    }
  }

  return (
    <form onSubmit={submit} aria-label={entry ? "Edit time entry" : "Add time entry"} className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50/60 p-4 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-sm text-slate-700 sm:col-span-2">
        Description (include the ticket number, e.g. #21786)
        <Input value={description} onChange={(event) => setDescription(event.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-sm text-slate-700">
        Project
        <select
          className={SELECT}
          value={projectId}
          onChange={(event) => {
            setProjectId(event.target.value);
            setTaskId("");
          }}
        >
          <option value="">No project</option>
          {(catalog.data?.projects ?? []).map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm text-slate-700">
        Task
        <select className={SELECT} value={taskId} disabled={!projectId} onChange={(event) => setTaskId(event.target.value)}>
          <option value="">No task</option>
          {tasks.map((task) => (
            <option key={task.id} value={task.id}>
              {task.name}
            </option>
          ))}
        </select>
      </label>
      {catalog.isError && !catalog.data ? (
        <div className="sm:col-span-2">
          <LoadErrorNotice what="Projects and tasks" onRetry={() => void catalog.refetch()} isRetrying={catalog.isFetching} />
        </div>
      ) : null}
      <label className="flex flex-col gap-1 text-sm text-slate-700">
        Start
        <Input type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-sm text-slate-700">
        End
        <Input type="datetime-local" value={end} onChange={(event) => setEnd(event.target.value)} disabled={entry?.running && !end} />
      </label>
      {timeZone ? <p className="text-xs text-slate-500 sm:col-span-2">Times are in {timeZone}, your Solidtime time zone.</p> : null}
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={billable} onChange={(event) => setBillable(event.target.checked)} /> Billable
      </label>
      {error ? (
        <p role="alert" className="text-sm text-rose-600 sm:col-span-2">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" size="sm" disabled={isProposing}>
          {entry ? "Propose change…" : "Propose entry…"}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
