import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Spinner } from "@/components/ui/spinner";
import { Updating } from "@/components/ui/updating";
import { EmptyState, ErrorCard, SkeletonRows, StaleDataBanner } from "@/features/azure-devops/components/feedback";
import { StatusBadge } from "@/features/azure-devops/components/status-badge";
import type { ProposeActionInput } from "@/features/azure-devops/types/action.types";
import type { Tone } from "@/features/azure-devops/utils/labels";
import { retryUnlessClientError } from "@/features/azure-devops/utils/query-retry";
import { cn } from "@/utils/cn";
import { getVerification } from "../api/solidtime.api";
import { solidtimeKeys } from "../api/solidtime.keys";
import type { SolidtimeConnection, VerificationItem, VerificationStatus } from "../types/solidtime.types";
import { rangePresets } from "../utils/range-presets";
import { formatDayLabel, formatHours } from "../utils/time";
import { TicketTimeLookup } from "./ticket-time-lookup";

/** At most this many tickets go into one combined approval (the backend's limit). */
const BATCH_LIMIT = 50;

/** label: the row badge; summary: the same status in the summary line ("2 missing in Azure"). */
const STATUS: Record<VerificationStatus, { label: string; summary: string; tone: Tone }> = {
  missing: { label: "Missing in Azure", summary: "missing in Azure", tone: "danger" },
  mismatch: { label: "Differs", summary: "differ", tone: "warning" },
  "azure-higher": { label: "Azure higher", summary: "Azure higher", tone: "info" },
  remaining: { label: "Remaining outdated", summary: "remaining outdated", tone: "neutral" },
  running: { label: "Timer running", summary: "timer running", tone: "neutral" },
  "cannot-update": { label: "Can't update", summary: "can't update", tone: "neutral" },
  matched: { label: "Matched", summary: "matched", tone: "success" },
};

/** Azure can be brought in line: it is behind on Completed Work, or only Remaining Work is out of date. */
const canSync = (item: VerificationItem) => item.status === "missing" || item.status === "mismatch" || item.status === "remaining";

/** Completed Work stays as Azure has it when only Remaining Work is out of date (the server then writes Remaining alone). */
function updateParams(item: VerificationItem) {
  return {
    completedWork: item.status === "remaining" ? (item.azure.completedWork ?? item.suggested.completedWork) : item.suggested.completedWork,
    ...(item.suggested.remainingWork === null ? {} : { remainingWork: item.suggested.remainingWork }),
  };
}

interface VerifyTabProps {
  connection: SolidtimeConnection;
  onPropose: (input: ProposeActionInput) => void;
  isProposing: boolean;
  today: string;
}

/**
 * Time → Verify: the tickets I logged time on in a period, each ticket's
 * all-time Solidtime total next to Azure's Completed Work. Azure is only ever
 * raised to match, and only through an approval (one ticket, or all at once).
 */
export function VerifyTab({ connection, onPropose, isProposing, today }: VerifyTabProps) {
  // Today by default; the Range picker offers longer periods.
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const verification = useQuery({
    queryKey: solidtimeKeys.verification(connection.credentialId, from, to),
    queryFn: () => getVerification(connection.credentialId, { from, to }),
    placeholderData: keepPreviousData,
    retry: retryUnlessClientError,
  });
  const data = verification.data;
  const singleDay = from === to;
  const azureCredentialId = connection.azureCredentialId;
  const syncable = (data?.items ?? []).filter(canSync);
  const outOfSync = (data?.items ?? []).filter((item) => item.status !== "matched");
  const batch = syncable.slice(0, BATCH_LIMIT);

  function setRange(nextFrom: string, nextTo: string) {
    setFrom(nextFrom);
    setTo(nextTo);
  }

  function proposeAll() {
    if (!azureCredentialId || batch.length === 0) return;
    onPropose({
      credentialId: azureCredentialId,
      kind: "WORK_ITEMS_UPDATE_TIME",
      source: "USER",
      target: {},
      params: { items: batch.map((item) => ({ projectId: item.projectName, workItemId: item.ticketId, ...updateParams(item) })) },
    });
  }

  function proposeOne(item: VerificationItem) {
    if (!azureCredentialId) return;
    onPropose({
      credentialId: azureCredentialId,
      kind: "WORK_ITEM_UPDATE_FIELDS",
      source: "USER",
      target: { projectId: item.projectName, workItemId: item.ticketId },
      params: updateParams(item),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col gap-3 p-4">
          <div>
            <h3 className="text-base font-semibold text-slate-950">Solidtime vs Azure</h3>
            <p className="mt-0.5 text-sm text-slate-600">Total time in Solidtime vs Completed Work in Azure, for tickets you worked on in the period.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
            {/* One day (Today by default, any day from its calendar), or a range with quick choices. */}
            <DatePicker
              aria-label="Day"
              size="sm"
              value={singleDay ? from : ""}
              displayValue={singleDay && from === today ? "Today" : undefined}
              placeholder="One day"
              max={today}
              onChange={(picked) => picked && setRange(picked, picked)}
              className={singleDay ? "border-indigo-300 bg-indigo-50 font-medium text-indigo-800" : "text-slate-600"}
            />
            <DateRangePicker aria-label="Range" from={from} to={to} active={!singleDay} presets={rangePresets(today)} max={today} maxDays={366} placeholder="Range" onChange={setRange} />
            <Button size="sm" variant="ghost" disabled={verification.isFetching} onClick={() => void verification.refetch()}>
              {verification.isFetching ? <Spinner className="size-4" /> : null}
              Check again
            </Button>
          </div>
        </Card>

        <TicketTimeLookup connection={connection} onPropose={onPropose} isProposing={isProposing} />
      </div>

      {verification.isLoading ? (
        <SkeletonRows rows={4} />
      ) : !data ? (
        <ErrorCard error={verification.error} credentialId={azureCredentialId ?? undefined} onRetry={() => void verification.refetch()} isRetrying={verification.isFetching} />
      ) : (
        <Updating active={verification.isPlaceholderData}>
          <div className="flex flex-col gap-4">
            {verification.error ? <StaleDataBanner error={verification.error} onRetry={() => void verification.refetch()} isRetrying={verification.isFetching} /> : null}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-700" aria-live="polite">
                <span className="font-semibold text-slate-950">
                  {data.items.length} ticket{data.items.length === 1 ? "" : "s"}
                </span>{" "}
                {formatDayLabel(data.from, { day: "numeric", month: "short" })}
                {data.to === data.from ? "" : ` – ${formatDayLabel(data.to, { day: "numeric", month: "short" })}`}
                {data.items.length > 0 ? (
                  <>
                    {" · "}
                    {(Object.keys(STATUS) as VerificationStatus[])
                      .filter((status) => data.counts[status] > 0)
                      .map((status) => `${data.counts[status]} ${STATUS[status].summary}`)
                      .join(" · ")}
                  </>
                ) : null}
              </p>
              {syncable.length > 0 ? (
                <Button disabled={isProposing || !azureCredentialId} onClick={proposeAll}>
                  {syncable.length > BATCH_LIMIT ? `Update first ${BATCH_LIMIT} of ${syncable.length} in Azure…` : `Update ${syncable.length} in Azure…`}
                </Button>
              ) : null}
            </div>

            {data.basis === "mine" && outOfSync.length > 0 ? (
              <p role="note" className="text-xs text-amber-700">
                Totals use your own time only (your Solidtime role can't see teammates'). Azure is never lowered.
              </p>
            ) : null}

            {data.items.length === 0 ? (
              <EmptyState>No time on Azure tickets in this period.</EmptyState>
            ) : (
              // Every ticket with its status; the ones that need attention come first.
              <Card className="overflow-hidden">
                <ul aria-label="Tickets" className="stagger divide-y divide-slate-200">
                  {data.items.map((item) => (
                    <VerificationRow key={item.ticketId} item={item} azureCredentialId={azureCredentialId} isProposing={isProposing} onUpdate={() => proposeOne(item)} />
                  ))}
                </ul>
              </Card>
            )}

            {data.notFound.length > 0 || data.unlinkedHours > 0 ? (
              <p className="text-xs text-slate-500">
                {data.notFound.length > 0
                  ? `Not tickets in the linked Azure organization: ${data.notFound.map((entry) => `#${entry.ticketId} (${formatHours(entry.periodHours)})`).join(", ")}. `
                  : ""}
                {data.unlinkedHours > 0 ? (
                  <>
                    {formatHours(data.unlinkedHours)} in this period names no ticket:{" "}
                    <Link to="?tab=unlinked" className="font-medium text-indigo-700 hover:underline">
                      No ticket
                    </Link>
                    .
                  </>
                ) : null}
              </p>
            ) : null}
          </div>
        </Updating>
      )}
    </div>
  );
}

function TicketLink({ item, azureCredentialId }: { item: VerificationItem; azureCredentialId: string | null }) {
  const label = `#${item.ticketId} ${item.title}`;
  return azureCredentialId ? (
    <Link
      to={`/azure/${encodeURIComponent(azureCredentialId)}/projects/${encodeURIComponent(item.projectName)}/work-items/${item.ticketId}`}
      className="min-w-0 truncate font-medium text-slate-950 hover:underline"
    >
      {label}
    </Link>
  ) : (
    <span className="min-w-0 truncate font-medium text-slate-950">{label}</span>
  );
}

/** Solidtime minus Azure, signed: "+2 h" means Azure is 2 h short. */
function gapLabel(item: VerificationItem): string {
  const gap = Math.round((item.trackedHours - (item.azure.completedWork ?? 0)) * 100) / 100;
  return gap > 0 ? `+${formatHours(gap)}` : `−${formatHours(-gap)}`;
}

/** One labelled figure in a fixed-width column, so the columns line up from row to row. */
function Figure({ label, children, tone = "text-slate-950", wide = false }: { label: string; children?: ReactNode; tone?: string; wide?: boolean }) {
  return (
    <div className={wide ? "w-28" : "w-20"}>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={cn("font-semibold", tone)}>{children}</dd>
    </div>
  );
}

function VerificationRow({
  item,
  azureCredentialId,
  isProposing,
  onUpdate,
}: {
  item: VerificationItem;
  azureCredentialId: string | null;
  isProposing: boolean;
  onUpdate: () => void;
}) {
  const status = STATUS[item.status];
  const azureCompleted = item.azure.completedWork === null ? "—" : formatHours(item.azure.completedWork);

  return (
    <li className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
          <TicketLink item={item} azureCredentialId={azureCredentialId} />
          {item.finished ? (
            <StatusBadge tone="neutral" dot={false} title="The work is done: Remaining Work is left as it is">
              {item.state}
            </StatusBadge>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {item.type} · {item.projectName}
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <dl className="flex gap-2 tabular-nums">
          <Figure label="Solidtime">{formatHours(item.trackedHours)}</Figure>
          {item.status === "remaining" ? (
            <>
              <Figure label="Completed" tone="text-emerald-700">
                {azureCompleted} ✓
              </Figure>
              <Figure label="Remaining" tone="text-slate-700" wide>
                {item.azure.remainingWork === null ? "—" : formatHours(item.azure.remainingWork)} → {formatHours(item.suggested.remainingWork ?? 0)}
              </Figure>
            </>
          ) : (
            <>
              <Figure label="Azure">{azureCompleted}</Figure>
              {item.status === "cannot-update" || item.status === "matched" ? (
                // Keeps the columns aligned with the rows that have a gap.
                <div className="w-28" aria-hidden="true" />
              ) : (
                <Figure label="Gap" tone={item.status === "azure-higher" ? "text-slate-600" : "text-rose-700"} wide>
                  {gapLabel(item)}
                </Figure>
              )}
            </>
          )}
        </dl>

        <div className="w-48 md:text-right">
          {canSync(item) ? (
            <Button size="sm" variant="secondary" disabled={isProposing || !azureCredentialId} onClick={onUpdate}>
              {item.status === "remaining" ? "Update remaining…" : "Update Azure…"}
            </Button>
          ) : (
            <span className="text-xs text-slate-500">
              {item.status === "matched"
                ? "In sync"
                : item.status === "azure-higher"
                ? "Azure has more; never lowered."
                : item.status === "running"
                  ? "Stop the timer, then check again."
                  : `No Completed Work on ${item.type}.`}
            </span>
          )}
        </div>
      </div>
    </li>
  );
}
