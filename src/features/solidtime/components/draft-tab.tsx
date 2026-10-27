import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState, ErrorCard, SkeletonRows } from "@/features/azure-devops/components/feedback";
import { StatusBadge } from "@/features/azure-devops/components/status-badge";
import type { ProposeActionInput } from "@/features/azure-devops/types/action.types";
import { retryUnlessClientError } from "@/features/azure-devops/utils/query-retry";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/utils/cn";
import { estimateDraft, getDraft } from "../api/solidtime.api";
import { solidtimeKeys } from "../api/solidtime.keys";
import { useCatalog } from "../hooks/use-solidtime";
import type { DayDraft, DraftEstimate, DraftRow, ProjectSource, SolidtimeConnection } from "../types/solidtime.types";
import { formatHours, shiftDay, zonedClock, zonedInstant } from "../utils/time";

const SELECT = "h-9 w-full rounded-lg border border-slate-300 bg-surface px-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20";
const HOUR = 3_600_000;
/** AI errors that are fixed on the Credentials page. */
const AI_SETUP_REASONS = new Set(["AI_NOT_CONFIGURED", "AI_KEY_REQUIRED", "AI_MODEL_UNAVAILABLE", "DATA_COLLECTION_NOT_ACCEPTED", "AI_KEY_INVALID", "DAILY_LIMIT_REACHED"]);

type HoursFrom = "completed-work" | "ai" | "you" | null;

interface Editable {
  include: boolean;
  description: string;
  projectId: string;
  /** "HH:MM" in the Solidtime time zone, or "". */
  start: string;
  /** The hours field as typed. */
  hours: string;
  hoursFrom: HoursFrom;
  /** The start was set by hand: AI suggestions keep it. */
  startEdited: boolean;
  /** I unticked the row: the AI leaves it alone. */
  unticked: boolean;
  ai: { confidence: string; reason: string } | null;
}

function parseHours(text: string): number | null {
  const value = Number(text);
  return text.trim() !== "" && Number.isFinite(value) && value > 0 && value <= 24 ? value : null;
}

function editableFrom(row: DraftRow, timeZone: string): Editable {
  const hours = row.hours !== null && row.hours > 0 ? row.hours : null;
  return {
    include: hours !== null && row.start !== null,
    description: row.description,
    projectId: row.solidtimeProjectId ?? "",
    start: row.start ? zonedClock(row.start, timeZone) : "",
    hours: hours === null ? "" : String(hours),
    // A Completed Work row with 0 h is already in Solidtime: it keeps that source and is never estimated.
    hoursFrom: row.hoursSource,
    startEdited: false,
    unticked: false,
    ai: null,
  };
}

/** A start that ends the entry at `end` (ms), not before the day starts. */
function startBefore(end: number, hours: number, dayStart: string, timeZone: string): string {
  return zonedClock(new Date(Math.max(end - hours * HOUR, Date.parse(dayStart))).toISOString(), timeZone);
}

const PROJECT_HINT: Record<ProjectSource, (row: DraftRow) => string> = {
  mapping: () => "From your project mapping",
  ticket: () => "Used for this ticket before",
  "azure-project": (row) => `Most used for ${row.projectName} tickets`,
  name: () => "Same name as the Azure project",
};

function HoursBadge({ edit, row }: { edit: Editable; row: DraftRow }) {
  if (edit.hoursFrom === "completed-work") {
    return parseHours(edit.hours) === null ? <StatusBadge tone="neutral">Already in Solidtime</StatusBadge> : <StatusBadge tone="success">Completed Work +{row.completedWorkAdded} h</StatusBadge>;
  }
  if (edit.hoursFrom === "ai") return <StatusBadge tone="info">AI · {edit.ai?.confidence ?? "?"} confidence</StatusBadge>;
  if (edit.hoursFrom === "you") return <StatusBadge tone="neutral">Entered by you</StatusBadge>;
  return <StatusBadge tone="warning">Needs hours</StatusBadge>;
}

function aiErrorText(error: unknown): { text: string; setup: boolean } {
  if (error instanceof ApiError) {
    return { text: error.message, setup: AI_SETUP_REASONS.has(error.reason ?? "") };
  }

  return { text: "The AI could not suggest hours. Try again.", setup: false };
}

/**
 * Draft a day from Azure DevOps: tickets I changed that day, hours from my
 * Completed Work increases (minus what Solidtime already has), projects from
 * my mapping or earlier entries, and AI hours for the rest on request.
 * Review, adjust, then propose the whole day for one approval.
 */
export function DraftTab({ connection, onPropose, isProposing, today }: { connection: SolidtimeConnection; onPropose: (input: ProposeActionInput) => void; isProposing: boolean; today: string }) {
  const [day, setDay] = useState(today);
  const catalog = useCatalog(connection.credentialId);
  const draft = useQuery({
    queryKey: solidtimeKeys.draft(connection.credentialId, day),
    queryFn: () => getDraft(connection.credentialId, day),
    retry: retryUnlessClientError,
    // A rebuilt draft replaces the edits made on it: only rebuild when asked.
    staleTime: Infinity,
  });
  const data = draft.data;
  const timeZone = data?.timeZone ?? "UTC";
  const initial = useMemo(() => Object.fromEntries((data?.rows ?? []).map((row) => [row.ticketId, editableFrom(row, data?.timeZone ?? "UTC")])) as Record<number, Editable>, [data]);
  // Edits belong to the draft they were made on; a new draft starts from its own suggestions.
  const [edits, setEdits] = useState<{ source: DayDraft | undefined; rows: Record<number, Editable> }>({ source: undefined, rows: {} });
  const rows = edits.source === data && data !== undefined ? edits.rows : initial;
  const [aiResult, setAiResult] = useState<{ source: DayDraft; estimate: DraftEstimate } | null>(null);

  const dayStart = data ? zonedInstant(data.day, "00:00", timeZone) : null;
  const dayEnd = data ? zonedInstant(shiftDay(data.day, 1), "00:00", timeZone) : null;

  /** The entry a row would create, or why it cannot be proposed yet. */
  function slotOf(edit: Editable): { start: number; end: number } | string {
    const hours = parseHours(edit.hours);
    if (hours === null) return "Enter the hours (up to 24).";
    const start = data ? zonedInstant(data.day, edit.start, timeZone) : null;
    if (!start) return "Enter a start time.";
    const end = Date.parse(start) + hours * HOUR;
    if (dayEnd && end > Date.parse(dayEnd)) return "Ends after midnight: start earlier or enter fewer hours.";
    return { start: Date.parse(start), end };
  }

  const allRows = data?.rows ?? [];
  const chosen = allRows.filter((row) => rows[row.ticketId]?.include);
  const slots = new Map(chosen.map((row) => [row.ticketId, slotOf(rows[row.ticketId]!)]));
  const invalid = chosen.filter((row) => typeof slots.get(row.ticketId) === "string");
  const plannedHours = chosen.reduce((sum, row) => sum + (parseHours(rows[row.ticketId]!.hours) ?? 0), 0);

  function overlapOf(ticketId: number): string | null {
    const slot = slots.get(ticketId);
    if (!slot || typeof slot === "string") return null;
    const clash = (other: { start: number; end: number }) => slot.start < other.end && other.start < slot.end;
    const existing = (data?.busy ?? []).find((busy) => clash({ start: Date.parse(busy.start), end: Date.parse(busy.end) }));
    if (existing) return `Overlaps your Solidtime entry ${zonedClock(existing.start, timeZone)}–${zonedClock(existing.end, timeZone)}.`;
    const other = chosen.find((row) => {
      const otherSlot = slots.get(row.ticketId);
      return row.ticketId !== ticketId && otherSlot !== undefined && typeof otherSlot !== "string" && clash(otherSlot);
    });
    return other ? `Overlaps #${other.ticketId} in this draft.` : null;
  }

  const save = (next: Record<number, Editable>) => setEdits({ source: data, rows: next });
  const set = (ticketId: number, change: Partial<Editable>) => save({ ...rows, [ticketId]: { ...rows[ticketId]!, ...change } });

  /** New hours keep the entry's end (at first: my last change on the ticket) unless I set the start myself. */
  function setHours(row: DraftRow, text: string) {
    const edit = rows[row.ticketId]!;
    const hours = parseHours(text);
    let start = edit.start;

    if (hours !== null && !edit.startEdited && dayStart && data) {
      const before = parseHours(edit.hours);
      const beforeStart = zonedInstant(data.day, edit.start, timeZone);
      const end = beforeStart && before !== null ? Date.parse(beforeStart) + before * HOUR : Date.parse(row.anchor);
      start = startBefore(end, hours, dayStart, timeZone);
    }

    // Clearing the hours hands the row back (to the AI, or to me later).
    const cleared = text.trim() === "";
    set(row.ticketId, { hours: text, hoursFrom: cleared ? null : "you", ai: null, start, ...(hours !== null ? { include: true, unticked: false } : {}) });
  }

  // Rows whose hours do not come from Completed Work or from me, and that I did not untick.
  const toEstimate = allRows.filter((row) => {
    const edit = rows[row.ticketId];
    return row.hoursSource !== "completed-work" && edit !== undefined && edit.hoursFrom !== "you" && !edit.unticked;
  });
  const estimate = useMutation({
    mutationFn: () => {
      const asked = new Set(toEstimate.map((row) => row.ticketId));
      const others = chosen.filter((row) => !asked.has(row.ticketId));
      const plannedHours = others.reduce((sum, row) => sum + (parseHours(rows[row.ticketId]!.hours) ?? 0), 0);
      // Where the other rows sit now, so the AI rows are placed around them.
      const planned = others.flatMap((row) => {
        const slot = slots.get(row.ticketId);
        return slot && typeof slot !== "string" ? [{ start: new Date(slot.start).toISOString(), end: new Date(slot.end).toISOString() }] : [];
      });
      return estimateDraft(connection.credentialId, { day: data!.day, ticketIds: [...asked], plannedHours: Math.min(24, Math.round(plannedHours * 100) / 100), planned });
    },
    onSuccess: (result) => {
      if (!data) return;
      const next = { ...rows };

      for (const item of result.estimates) {
        const row = allRows.find((candidate) => candidate.ticketId === item.ticketId);
        const edit = next[item.ticketId];
        // Rows I changed while the AI was answering keep my changes.
        if (!row || !edit || edit.hoursFrom === "you" || edit.unticked) continue;
        const start = edit.startEdited ? edit.start : item.start ? zonedClock(item.start, timeZone) : edit.start || (dayStart && item.hours > 0 ? startBefore(Date.parse(row.anchor), item.hours, dayStart, timeZone) : "");
        next[item.ticketId] = { ...edit, hours: item.hours > 0 ? String(item.hours) : "", hoursFrom: "ai", ai: { confidence: item.confidence, reason: item.reason }, include: item.hours > 0, start };
      }

      save(next);
      setAiResult({ source: data, estimate: result });
    },
  });
  const shownAi = aiResult && aiResult.source === data ? aiResult.estimate : null;
  const aiError = estimate.error ? aiErrorText(estimate.error) : null;

  function propose() {
    onPropose({
      credentialId: connection.credentialId,
      kind: "SOLIDTIME_ENTRIES_CREATE",
      target: {},
      params: {
        entries: chosen.map((row) => {
          const edit = rows[row.ticketId]!;
          const slot = slots.get(row.ticketId) as { start: number; end: number };
          return { start: new Date(slot.start).toISOString(), end: new Date(slot.end).toISOString(), description: edit.description.trim() || null, projectId: edit.projectId || null, taskId: null, tags: [], billable: false };
        }),
      },
    });
  }

  const changeDay = (next: string) => {
    if (next >= shiftDay(today, -14) && next <= today) {
      estimate.reset();
      setDay(next);
    }
  };
  const target = data?.targetHours ?? connection.dailyTargetHours;
  const tracked = data?.trackedHours ?? 0;
  const percent = (hours: number) => `${Math.min(100, Math.max(0, (hours / Math.max(target, 0.25)) * 100))}%`;

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" aria-label="Previous day" disabled={day <= shiftDay(today, -14)} onClick={() => changeDay(shiftDay(day, -1))}>
              ←
            </Button>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <span className="sr-only">Day</span>
              <Input type="date" aria-label="Day" className="h-9 w-40" value={day} min={shiftDay(today, -14)} max={today} onChange={(event) => event.target.value && changeDay(event.target.value)} />
            </label>
            <Button size="sm" variant="secondary" aria-label="Next day" disabled={day >= today} onClick={() => changeDay(shiftDay(day, 1))}>
              →
            </Button>
            {day !== today ? (
              <Button size="sm" variant="ghost" onClick={() => changeDay(today)}>
                Today
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" disabled={draft.isFetching} onClick={() => void draft.refetch()}>
              {draft.isFetching && !draft.isLoading ? <Spinner className="size-4" /> : null}
              Rebuild
            </Button>
          </div>
          <Button size="sm" disabled={!data || toEstimate.length === 0 || estimate.isPending} onClick={() => estimate.mutate()} title={toEstimate.length === 0 ? "Every row already has hours from Completed Work or from you." : undefined}>
            {estimate.isPending ? <Spinner className="size-4" /> : <span aria-hidden="true">✦</span>}
            Suggest hours with AI
          </Button>
        </div>

        <div aria-label="Day summary" className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <p className="text-slate-700">
              <span className="font-semibold text-slate-950">{formatHours(tracked + plannedHours)}</span> of {formatHours(target)} target
              <span className="text-slate-500">
                {" "}
                · {formatHours(tracked)} already in Solidtime · {formatHours(plannedHours)} in this draft
              </span>
            </p>
            <p className="text-xs text-slate-500">Times in {timeZone}. Nothing is saved until you approve it.</p>
          </div>
          <div className="relative h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
            <div className="absolute inset-y-0 left-0 bg-slate-400" style={{ width: percent(tracked) }} />
            <div className="absolute inset-y-0 bg-indigo-500" style={{ left: percent(tracked), width: percent(plannedHours) }} />
          </div>
        </div>

        {aiError ? (
          <p role="alert" className="text-sm text-rose-600">
            {aiError.text}
            {aiError.setup ? (
              <>
                {" "}
                <Link to="/credentials" className="font-medium text-indigo-700 hover:underline">
                  Open AI settings
                </Link>
              </>
            ) : null}
          </p>
        ) : null}
        {shownAi ? (
          <p role="status" className="text-sm text-slate-600">
            {shownAi.model === null
              ? "Your day already reaches its target, so the AI was not asked."
              : `AI (${shownAi.model}) shared ${formatHours(shownAi.availableHours)} across ${shownAi.estimates.length} ticket${shownAi.estimates.length === 1 ? "" : "s"} · about $${shownAi.costUsd.toFixed(4)}. Check each row before proposing.`}
          </p>
        ) : null}
      </Card>

      {draft.isLoading ? (
        <SkeletonRows rows={4} />
      ) : draft.error || !data ? (
        <ErrorCard error={draft.error} onRetry={() => void draft.refetch()} />
      ) : data.rows.length === 0 ? (
        <EmptyState>No Azure DevOps activity by you on {day}.</EmptyState>
      ) : (
        <>
          <ul aria-label="Drafted entries" className="flex flex-col gap-3">
            {data.rows.map((row) => {
              const edit = rows[row.ticketId];
              if (!edit) return null;
              const slot = edit.include ? slots.get(row.ticketId) : undefined;
              const problem = typeof slot === "string" ? slot : null;
              const overlap = edit.include ? overlapOf(row.ticketId) : null;
              const projectHint = edit.projectId && edit.projectId === row.solidtimeProjectId && row.projectSource ? PROJECT_HINT[row.projectSource](row) : edit.projectId ? "Chosen by you" : row.projectMatches.length > 1 ? `${row.projectMatches.length} projects match (${row.projectMatches.join(", ")}): choose one` : "No match: choose a project";
              const ticketPath = connection.azureCredentialId
                ? `/azure/${encodeURIComponent(connection.azureCredentialId)}/projects/${encodeURIComponent(row.projectName)}/work-items/${row.ticketId}`
                : null;

              return (
                <li key={row.ticketId} className={cn("rounded-xl border bg-surface p-4 shadow-sm", edit.include ? "border-indigo-200" : "border-slate-200")}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <label className="flex min-w-0 items-start gap-3">
                      <input type="checkbox" className="mt-1 size-4 accent-indigo-600" checked={edit.include} onChange={(event) => set(row.ticketId, { include: event.target.checked, unticked: !event.target.checked })} aria-label={`Include #${row.ticketId}`} />
                      <span className="min-w-0">
                        <span className="block font-medium text-slate-950">
                          #{row.ticketId} {row.title}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {row.type} · {row.state || "no state"} · {row.projectName}
                          {row.originalEstimate !== null ? ` · estimate ${row.originalEstimate} h` : ""}
                          {row.remainingWork !== null ? ` · ${row.remainingWork} h remaining` : ""}
                          {row.alreadyTrackedHours ? ` · ${row.alreadyTrackedHours} h already in Solidtime` : ""}
                        </span>
                      </span>
                    </label>
                    <div className="flex items-center gap-2">
                      <HoursBadge edit={edit} row={row} />
                      {ticketPath ? (
                        <Link to={ticketPath} className="text-xs font-medium text-indigo-700 hover:underline">
                          Open ticket
                        </Link>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-[minmax(0,1fr)_4rem_minmax(0,1fr)] gap-2 sm:gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_8.5rem_5.5rem_8.5rem]">
                    <label className="col-span-3 flex flex-col gap-1 text-xs font-medium text-slate-600 lg:col-span-1">
                      Description
                      <Input aria-label={`Description for #${row.ticketId}`} className="h-9 text-sm" value={edit.description} onChange={(event) => set(row.ticketId, { description: event.target.value })} />
                    </label>
                    <label className="col-span-3 flex flex-col gap-1 text-xs font-medium text-slate-600 lg:col-span-1">
                      Project
                      <select aria-label={`Project for #${row.ticketId}`} className={SELECT} value={edit.projectId} onChange={(event) => set(row.ticketId, { projectId: event.target.value })}>
                        <option value="">No project</option>
                        {(catalog.data?.projects ?? []).map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.name}
                          </option>
                        ))}
                      </select>
                      <span className={cn("font-normal", edit.projectId ? "text-slate-500" : "text-amber-700")}>{projectHint}</span>
                    </label>
                    <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                      Start
                      <Input aria-label={`Start for #${row.ticketId}`} type="time" className="h-9 px-2 text-sm" value={edit.start} onChange={(event) => set(row.ticketId, { start: event.target.value, startEdited: true })} />
                    </label>
                    <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                      Hours
                      <Input aria-label={`Hours for #${row.ticketId}`} type="number" inputMode="decimal" min={0.25} max={24} step={0.25} className="h-9 text-sm" value={edit.hours} placeholder="0" onChange={(event) => setHours(row, event.target.value)} />
                    </label>
                    <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                      End
                      <Input
                        aria-label={`End for #${row.ticketId}`}
                        type="time"
                        readOnly
                        tabIndex={-1}
                        className="h-9 border-transparent bg-slate-50 px-2 text-sm shadow-none"
                        value={slot && typeof slot !== "string" ? zonedClock(new Date(slot.end).toISOString(), timeZone) : ""}
                      />
                    </label>
                  </div>

                  {edit.ai ? <p className="mt-2 text-xs text-sky-800">AI: {edit.ai.reason || "No reason given."}</p> : null}
                  {row.note ? <p className="mt-2 text-xs text-amber-700">{row.note}</p> : null}
                  {problem ? <p className="mt-2 text-xs font-medium text-rose-600">{problem}</p> : null}
                  {overlap ? <p className="mt-2 text-xs text-amber-700">{overlap}</p> : null}

                  <details className="mt-2 text-xs text-slate-500">
                    <summary className="cursor-pointer select-none">
                      {row.activity.length} change{row.activity.length === 1 ? "" : "s"} by you in Azure DevOps
                    </summary>
                    <ul className="mt-1 ml-4 list-disc">
                      {row.activity.map((item, index) => (
                        <li key={`${item.at}:${index}`}>
                          {zonedClock(item.at, timeZone)} · {item.what}
                        </li>
                      ))}
                    </ul>
                  </details>
                </li>
              );
            })}
          </ul>
          {data.truncated ? <p className="text-xs text-amber-700">Only the 50 most recently changed tickets are shown.</p> : null}

          <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-surface/95 px-4 py-3 shadow-lg backdrop-blur">
            <p className="text-sm text-slate-700">
              {chosen.length} of {data.rows.length} tickets · {formatHours(plannedHours)}
              {invalid.length > 0 ? <span className="text-rose-600"> · {invalid.length} need attention</span> : null}
            </p>
            <Button disabled={isProposing || chosen.length === 0 || invalid.length > 0} onClick={propose}>
              Propose {chosen.length} entr{chosen.length === 1 ? "y" : "ies"}…
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
