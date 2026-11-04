import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Hint } from "@/components/ui/hint";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { SelectField } from "@/components/ui/select-field";
import { StatusNotice } from "@/components/ui/status-notice";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState, ErrorCard, PartialReadNotice, SkeletonRows, StaleDataBanner } from "@/features/azure-devops/components/feedback";
import { StatusBadge } from "@/features/azure-devops/components/status-badge";
import type { ProposeActionInput } from "@/features/azure-devops/types/action.types";
import { retryUnlessClientError } from "@/features/azure-devops/utils/query-retry";
import { useUnsavedStash } from "@/hooks/use-unsaved-stash";
import { ApiError } from "@/lib/api-client";
import { errorMessage } from "@/lib/error-text";
import { cn } from "@/utils/cn";
import { estimateDraft, getDraft } from "../api/solidtime.api";
import { solidtimeKeys } from "../api/solidtime.keys";
import { useCatalog } from "../hooks/use-solidtime";
import type { DayDraft, DraftEstimate, DraftRow, HoursSource, ProjectSource, SolidtimeConnection } from "../types/solidtime.types";
import { formatDayLabel, formatHours, shiftDay, zonedClock, zonedInstant } from "../utils/time";
import { LoadErrorNotice } from "./load-error-notice";

const HOUR = 3_600_000;
/** Unsaved edits older than this are not brought back after a sign-out. */
const STASH_MAX_AGE_MS = 12 * HOUR;
/** Why a draft may be missing tickets (DayDraft.truncatedReason). */
const TRUNCATED_TEXT: Record<NonNullable<DayDraft["truncatedReason"]> | "none", string | null> = {
  scan: "More than 200 tickets you changed since this day were found; only the 200 most recent were checked.",
  rows: "Only the 50 most recently changed tickets are shown.",
  none: null,
};
/** AI errors that are fixed on the Credentials page. */
const AI_SETUP_REASONS = new Set(["AI_NOT_CONFIGURED", "AI_KEY_REQUIRED", "AI_MODEL_UNAVAILABLE", "DATA_COLLECTION_NOT_ACCEPTED", "AI_KEY_INVALID", "DAILY_LIMIT_REACHED"]);

type HoursFrom = HoursSource | "ai" | "you" | null;

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
  ai: { confidence: string; reason: string; ruleHours: number } | null;
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
    // A row with 0 h is already in Solidtime: it keeps its source and is never checked by the AI.
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
  if ((edit.hoursFrom === "remaining-work" || edit.hoursFrom === "activity") && parseHours(edit.hours) === null) return <StatusBadge tone="neutral">Already in Solidtime</StatusBadge>;
  if (edit.hoursFrom === "remaining-work") return <StatusBadge tone="success">Remaining Work −{row.remainingWorkLowered} h</StatusBadge>;
  if (edit.hoursFrom === "activity") return <StatusBadge tone="neutral">From your activity</StatusBadge>;
  if (edit.hoursFrom === "ai") return <StatusBadge tone="info">AI · {edit.ai?.confidence ?? "?"} confidence</StatusBadge>;
  if (edit.hoursFrom === "you") return <StatusBadge tone="neutral">Entered by you</StatusBadge>;
  return <StatusBadge tone="warning">Needs hours</StatusBadge>;
}

function aiErrorText(error: unknown): { text: string; setup: boolean } {
  if (error instanceof ApiError) {
    return { text: errorMessage(error, "The AI could not check the hours. Try again."), setup: AI_SETUP_REASONS.has(error.reason ?? "") };
  }

  return { text: `The AI could not check the hours${error instanceof Error && error.message ? `: ${error.message}` : "."} Try again.`, setup: false };
}

const ticketList = (ids: number[]) => ids.map((id) => `#${id}`).join(", ");

/** What the AI did: which rule hours it kept, which it changed, and which tickets it did not answer for. */
function aiSummary(estimate: DraftEstimate, asked: number[]): string {
  const changed = estimate.estimates.filter((item) => item.hours !== item.ruleHours).map((item) => item.ticketId);
  const kept = estimate.estimates.length - changed.length;
  const answered = new Set(estimate.estimates.map((item) => item.ticketId));
  const missing = asked.filter((id) => !answered.has(id));
  return [
    `AI (${estimate.model}) checked ${estimate.estimates.length} ticket${estimate.estimates.length === 1 ? "" : "s"}: kept ${kept}${changed.length > 0 ? `, changed ${ticketList(changed)}` : ""}.`,
    missing.length > 0 ? `No result for ${ticketList(missing)} (no answer, or no longer needs checking): their hours are unchanged.` : null,
    `About $${estimate.costUsd.toFixed(4)}. Check each row before proposing.`,
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Draft a day from Azure DevOps: tickets I changed that day, hours from the
 * evidence (Completed Work raised, Remaining Work lowered, else the time
 * before my changes; minus what Solidtime already has), projects from my
 * mapping or earlier entries, and an AI check of the evidence hours on request.
 * Hours not on any ticket are shown, never spread over the tickets.
 * Review, adjust, then propose the whole day for one approval.
 */
export function DraftTab({ connection, onPropose, isProposing, today }: { connection: SolidtimeConnection; onPropose: (input: ProposeActionInput) => void; isProposing: boolean; today: string }) {
  const [day, setDay] = useState(today);
  const queryClient = useQueryClient();
  const catalog = useCatalog(connection.credentialId);
  const draft = useQuery({
    queryKey: solidtimeKeys.draft(connection.credentialId, day),
    queryFn: () => getDraft(connection.credentialId, day),
    retry: retryUnlessClientError,
    // A rebuilt draft replaces the edits made on it: only rebuild when asked.
    staleTime: Infinity,
  });
  /** Rebuild reads Azure DevOps and Solidtime fresh (refresh=true), into the same cache entry the tab shows. */
  const rebuild = () => {
    // Rebuild replaces the edits on purpose: no "reloaded" notice for it.
    setRebuildAsked(true);
    estimate.reset();
    const queryKey = solidtimeKeys.draft(connection.credentialId, day);
    // A load already running would be reused as is (without refresh=true): cancel it first.
    void queryClient
      .cancelQueries({ queryKey, exact: true })
      .then(() => queryClient.fetchQuery({ queryKey, queryFn: () => getDraft(connection.credentialId, day, { refresh: true }), retry: retryUnlessClientError, staleTime: 0 }))
      // The failure is shown from the query's own error state.
      .catch(() => undefined);
  };
  const [rebuildAsked, setRebuildAsked] = useState(false);
  const data = draft.data;
  const timeZone = data?.timeZone ?? "UTC";
  const initial = useMemo(() => Object.fromEntries((data?.rows ?? []).map((row) => [row.ticketId, editableFrom(row, data?.timeZone ?? "UTC")])) as Record<number, Editable>, [data]);
  // Edits belong to the draft they were made on; a new draft starts from its own suggestions.
  const [edits, setEdits] = useState<{ source: DayDraft | undefined; rows: Record<number, Editable> }>({ source: undefined, rows: {} });
  const rows = edits.source === data && data !== undefined ? edits.rows : initial;
  // The same day came back as a new draft (e.g. refetched after an approval) without me asking: my edits were replaced.
  const editsReplaced = !rebuildAsked && data !== undefined && edits.source !== undefined && edits.source !== data && edits.source.day === data.day;
  // Edits made on this draft are kept through a session expiry (restored on the same day, within 12 h).
  const unsavedRows = useMemo(
    () => (data !== undefined && edits.source === data && JSON.stringify(edits.rows) !== JSON.stringify(initial) ? { day: data.day, rows: edits.rows } : null),
    [data, edits, initial]
  );
  const unsaved = useUnsavedStash<{ day: string; rows: Record<number, Editable> }>(`draft:${connection.credentialId}:${day}`, unsavedRows, STASH_MAX_AGE_MS);
  const [restoredFor, setRestoredFor] = useState<DayDraft | null>(null);
  const [stashCheckedDays, setStashCheckedDays] = useState<string[]>([]);

  // The first time a day's draft shows, bring back edits that were not proposed when the session ended
  // (adjusted during render, so the restored rows are what is shown first).
  if (data && !stashCheckedDays.includes(data.day)) {
    setStashCheckedDays([...stashCheckedDays, data.day]);
    const kept = unsaved.read()?.value;

    if (kept?.day === data.day && edits.source !== data) {
      // Only rows still in this draft come back; new rows keep their suggestions.
      const rowsBack = Object.fromEntries(
        Object.entries(initial).map(([ticketId, edit]) => [ticketId, kept.rows[Number(ticketId)] ?? edit])
      ) as Record<number, Editable>;
      setEdits({ source: data, rows: rowsBack });
      setRestoredFor(data);
    }
  }
  const [aiResult, setAiResult] = useState<{ source: DayDraft; estimate: DraftEstimate; asked: number[] } | null>(null);

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

  const save = (next: Record<number, Editable>) => {
    setRebuildAsked(false);
    setEdits({ source: data, rows: next });
  };
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

  // Rows whose hours were worked out from Remaining Work or activity (and are not already in Solidtime), not changed or unticked by me.
  const toEstimate = allRows.filter((row) => {
    const edit = rows[row.ticketId];
    return (row.hoursSource === "remaining-work" || row.hoursSource === "activity") && (row.hours ?? 0) > 0 && edit !== undefined && edit.hoursFrom !== "you" && !edit.unticked;
  });
  const estimate = useMutation({
    mutationFn: (askedIds: number[]) => {
      const asked = new Set(askedIds);
      const others = chosen.filter((row) => !asked.has(row.ticketId));
      // Where the other rows sit now, so the AI rows are placed around them.
      const planned = others.flatMap((row) => {
        const slot = slots.get(row.ticketId);
        return slot && typeof slot !== "string" ? [{ start: new Date(slot.start).toISOString(), end: new Date(slot.end).toISOString() }] : [];
      });
      return estimateDraft(connection.credentialId, { day: data!.day, ticketIds: [...asked], planned });
    },
    onSuccess: (result, asked) => {
      if (!data) return;
      const next = { ...rows };

      for (const item of result.estimates) {
        const row = allRows.find((candidate) => candidate.ticketId === item.ticketId);
        const edit = next[item.ticketId];
        // Rows I changed while the AI was answering keep my changes.
        if (!row || !edit || edit.hoursFrom === "you" || edit.unticked) continue;
        const start = edit.startEdited ? edit.start : item.start ? zonedClock(item.start, timeZone) : edit.start || (dayStart && item.hours > 0 ? startBefore(Date.parse(row.anchor), item.hours, dayStart, timeZone) : "");
        next[item.ticketId] = { ...edit, hours: String(item.hours), hoursFrom: "ai", ai: { confidence: item.confidence, reason: item.reason, ruleHours: item.ruleHours }, include: true, start };
      }

      save(next);
      setAiResult({ source: data, estimate: result, asked });
    },
  });
  const shownAi = aiResult && aiResult.source === data ? aiResult : null;
  // Why "Check hours with AI" is off, shown next to it (a disabled button shows no tooltip).
  const aiBlocked = data && data.rows.length > 0 && toEstimate.length === 0 ? "Nothing to check: the AI checks hours worked out from Remaining Work or activity, and those rows are already in Solidtime, entered by you or unticked." : null;
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
  // What the evidence does not explain: shown for me to place, never spread over the tickets.
  const unallocated = Math.floor((target - tracked - plannedHours) * 4 + 1e-9) / 4;
  const percent = (hours: number) => `${Math.min(100, Math.max(0, (hours / Math.max(target, 0.25)) * 100))}%`;

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Hint label="Previous day">
              <Button size="sm" variant="secondary" aria-label="Previous day" disabled={day <= shiftDay(today, -14)} onClick={() => changeDay(shiftDay(day, -1))}>
                <ChevronLeftIcon />
              </Button>
            </Hint>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <span className="sr-only">Day</span>
              <DatePicker aria-label="Day" size="sm" value={day} min={shiftDay(today, -14)} max={today} onChange={(picked) => picked && changeDay(picked)} />
            </label>
            <Hint label="Next day">
              <Button size="sm" variant="secondary" aria-label="Next day" disabled={day >= today} onClick={() => changeDay(shiftDay(day, 1))}>
                <ChevronRightIcon />
              </Button>
            </Hint>
            {day !== today ? (
              <Button size="sm" variant="ghost" onClick={() => changeDay(today)}>
                Today
              </Button>
            ) : null}
            <Button size="sm" variant="secondary" disabled={draft.isFetching} onClick={rebuild} title="Read Azure DevOps and Solidtime again (your edits on this day are replaced)">
              {draft.isFetching && !draft.isLoading ? <Spinner className="size-4" /> : null}
              Rebuild
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {aiBlocked ? (
              <p id="ai-blocked" className="max-w-xs text-right text-xs text-slate-500">
                {aiBlocked}
              </p>
            ) : estimate.isPending ? (
              <p className="text-xs text-slate-500" aria-live="polite">
                Asking your AI model; this can take a minute.
              </p>
            ) : null}
            <Button size="sm" disabled={!data || toEstimate.length === 0 || estimate.isPending} aria-describedby={aiBlocked ? "ai-blocked" : undefined} onClick={() => estimate.mutate(toEstimate.map((row) => row.ticketId))}>
              {estimate.isPending ? <Spinner className="size-4" /> : <span aria-hidden="true">✦</span>}
              Check hours with AI
            </Button>
          </div>
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
          <div className="flex flex-wrap gap-4 text-xs text-slate-500" aria-hidden="true">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-slate-400" /> Already in Solidtime
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-indigo-500" /> In this draft
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-slate-100 ring-1 ring-slate-200" /> Left to your target
            </span>
          </div>
          {data && data.rows.length > 0 && unallocated >= 0.25 ? (
            <p className="text-sm text-slate-600">
              <span className="font-medium text-slate-900">{formatHours(unallocated)}</span> of your {formatHours(target)} target is not on any ticket. Meetings, reviews or other work? Add it on the Timesheet tab; it is not spread over these tickets.
            </p>
          ) : null}
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
          <StatusNotice as="p" className="text-sm text-slate-600">
            {aiSummary(shownAi.estimate, shownAi.asked)}
          </StatusNotice>
        ) : null}
      </Card>

      {editsReplaced ? (
        <StatusNotice className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>This day was loaded again (for example after an approval changed Solidtime), so your unsaved edits and AI hours were replaced. Rows already in Solidtime now say so.</span>
          <Button size="sm" variant="secondary" onClick={() => save(initial)}>
            OK
          </Button>
        </StatusNotice>
      ) : null}
      {restoredFor !== null && restoredFor === data ? (
        <StatusNotice className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>Restored your unsaved edits from before you were signed out.</span>
          <span className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setRestoredFor(null)}>
              OK
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { unsaved.drop(); setRestoredFor(null); save(initial); }}>
              Discard
            </Button>
          </span>
        </StatusNotice>
      ) : null}
      {/* A failed Rebuild keeps the draft and the edits made on it. */}
      {draft.error && data ? <StaleDataBanner error={draft.error} onRetry={rebuild} isRetrying={draft.isFetching} /> : null}
      {catalog.isError && !catalog.data ? <LoadErrorNotice what="Solidtime projects" error={catalog.error} onRetry={() => void catalog.refetch()} isRetrying={catalog.isFetching} /> : null}
      {/* What the draft may be missing: tickets past the caps, and reads that failed or were cut. */}
      {data ? <PartialReadNotice messages={[TRUNCATED_TEXT[data.truncatedReason ?? "none"], ...(data.warnings ?? [])]} /> : null}

      {draft.isLoading ? (
        <SkeletonRows rows={4} />
      ) : !data ? (
        <ErrorCard error={draft.error} onRetry={() => void draft.refetch()} isRetrying={draft.isFetching} />
      ) : data.rows.length === 0 ? (
        <EmptyState>
          You made no changes in Azure DevOps on {formatDayLabel(day, { weekday: "long", day: "numeric", month: "long" })}, so there is nothing to draft. Pick another day, or add time on the Timesheet tab.
        </EmptyState>
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
                      <Checkbox className="mt-1" checked={edit.include} onCheckedChange={(state) => set(row.ticketId, { include: state === true, unticked: !state === true })} aria-label={`Include #${row.ticketId}`} />
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
                      <SelectField aria-label={`Project for #${row.ticketId}`} size="sm" value={edit.projectId} onValueChange={(selected) => set(row.ticketId, { projectId: selected })}>
                        <option value="">No project</option>
                        {(catalog.data?.projects ?? []).map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.name}
                          </option>
                        ))}
                      </SelectField>
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

                  {row.hoursBasis ? (
                    <p className="mt-2 text-xs text-slate-500">
                      Hours from: {row.hoursBasis}
                      {row.alreadyTrackedHours ? `, minus ${row.alreadyTrackedHours} h already in Solidtime` : ""}.
                    </p>
                  ) : null}
                  {edit.ai ? (
                    <p className="mt-2 text-xs text-sky-800">
                      AI: {edit.ai.reason || "No reason given."}
                      {parseHours(edit.hours) !== edit.ai.ruleHours ? ` (the rules said ${edit.ai.ruleHours} h)` : ""}
                    </p>
                  ) : null}
                  {row.note ? <p className="mt-2 text-xs break-words text-amber-700">{row.note}</p> : null}
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
