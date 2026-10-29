import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";

import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Pagination } from "@/components/ui/pagination";
import { Spinner } from "@/components/ui/spinner";
import { Updating } from "@/components/ui/updating";
import { EmptyState, ErrorCard, SkeletonRows, StaleDataBanner, StatTile } from "@/features/azure-devops/components/feedback";
import { StatusBadge } from "@/features/azure-devops/components/status-badge";
import type { Page } from "@/features/azure-devops/types/azure.types";
import { retryUnlessClientError } from "@/features/azure-devops/utils/query-retry";
import { usePageParam, useSearchParamsUpdate, useSyncServedPage } from "@/hooks/use-page-param";
import { ApiError, apiDownload } from "@/lib/api-client";
import { cn } from "@/utils/cn";
import { getAccuracy, weeklyCsvUrl } from "../api/solidtime.api";
import { solidtimeKeys } from "../api/solidtime.keys";
import type { AccuracyRow, AccuracyTicket, SolidtimeConnection } from "../types/solidtime.types";
import { formatDayLabel, formatHours, shiftDay, weekStart } from "../utils/time";

const TABLE = "w-full text-left text-sm";
const HEAD = "border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500";
/** More than this share over the estimate is flagged. */
const OVER_WARNING = 1.2;

const percentOf = (ratio: number | null) => (ratio === null ? "—" : `${Math.round(ratio * 100)}%`);

function signedHours(hours: number): string {
  const rounded = Math.round(hours * 100) / 100;
  return `${rounded > 0 ? "+" : ""}${rounded} h`;
}

function RatioBadge({ ratio }: { ratio: number }) {
  if (ratio > OVER_WARNING) return <StatusBadge tone="danger">{percentOf(ratio)} · over</StatusBadge>;
  if (ratio > 1) return <StatusBadge tone="warning">{percentOf(ratio)} · slightly over</StatusBadge>;
  return <StatusBadge tone="success">{percentOf(ratio)} · within estimate</StatusBadge>;
}

function TicketTable({ page, azureCredentialId, onPage, busy }: { page: Page<AccuracyTicket>; azureCredentialId: string | null; onPage: (next: number) => void; busy: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-surface shadow-sm">
        <table className={cn(TABLE, "min-w-[640px]")} aria-label="Tickets compared">
          <thead className={HEAD}>
            <tr>
              <th className="px-4 py-2.5 font-medium">Ticket</th>
              <th className="px-4 py-2.5 text-right font-medium">Tracked</th>
              <th className="px-4 py-2.5 text-right font-medium">Estimate</th>
              <th className="px-4 py-2.5 text-right font-medium">Difference</th>
              <th className="px-4 py-2.5 text-right font-medium">Of estimate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {page.items.map((ticket) => (
              <tr key={ticket.ticketId}>
                <td className="px-4 py-3">
                  {azureCredentialId ? (
                    <Link
                      to={`/azure/${encodeURIComponent(azureCredentialId)}/projects/${encodeURIComponent(ticket.projectName)}/work-items/${ticket.ticketId}`}
                      className="font-medium text-slate-950 hover:text-indigo-700 hover:underline"
                    >
                      #{ticket.ticketId} {ticket.title}
                    </Link>
                  ) : (
                    <span className="font-medium text-slate-950">
                      #{ticket.ticketId} {ticket.title}
                    </span>
                  )}
                  <span className="block text-xs text-slate-500">
                    {ticket.type} · {ticket.projectName}
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-900">{formatHours(ticket.trackedHours)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-600">{formatHours(ticket.estimateHours)}</td>
                <td className={cn("px-4 py-3 text-right tabular-nums", ticket.trackedHours > ticket.estimateHours ? "font-medium text-rose-700" : "text-slate-600")}>
                  {signedHours(ticket.trackedHours - ticket.estimateHours)}
                </td>
                <td className="px-4 py-3 text-right">
                  <RatioBadge ratio={ticket.ratio} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination label="Compared ticket pages" page={page.page} totalPages={page.totalPages} total={page.total} pageSize={page.pageSize} disabled={busy} onChange={onPage} />
    </div>
  );
}

/** A grouped view (by person or by ticket type). */
function GroupTable({ title, column, page, onPage, busy }: { title: string; column: string; page: Page<AccuracyRow>; onPage: (next: number) => void; busy: boolean }) {
  return (
    <section className="flex flex-col gap-2" aria-label={title}>
      <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-surface shadow-sm">
        <table className={TABLE} aria-label={title}>
          <thead className={HEAD}>
            <tr>
              <th className="px-4 py-2.5 font-medium">{column}</th>
              <th className="px-4 py-2.5 text-right font-medium">Tickets</th>
              <th className="px-4 py-2.5 text-right font-medium">Tracked</th>
              <th className="px-4 py-2.5 text-right font-medium">Estimate</th>
              <th className="px-4 py-2.5 text-right font-medium">Of estimate</th>
              <th className="px-4 py-2.5 text-right font-medium">Went over</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {page.items.map((row) => (
              <tr key={row.key}>
                <td className="px-4 py-3 font-medium text-slate-900">{row.label}</td>
                <td className="px-4 py-3 text-right tabular-nums">{row.tickets}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatHours(row.trackedHours)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-600">{formatHours(row.estimateHours)}</td>
                <td className="px-4 py-3 text-right">{row.ratio === null ? "—" : <RatioBadge ratio={row.ratio} />}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {row.overEstimate} of {row.tickets}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination label={`${title} pages`} page={page.page} totalPages={page.totalPages} total={page.total} pageSize={page.pageSize} disabled={busy} onChange={onPage} />
    </section>
  );
}

const PRESETS = [
  { days: 7, label: "Last 7 days" },
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
];

/** Estimate accuracy (team when the role allows) and the weekly CSV export. */
export function ReportsTab({ connection, today }: { connection: SolidtimeConnection; today: string }) {
  const [from, setFrom] = useState(shiftDay(today, -29));
  const [to, setTo] = useState(today);
  const [week, setWeek] = useState(weekStart(shiftDay(today, -7)));
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const personPage = usePageParam("personPage");
  const typePage = usePageParam("typePage");
  const ticketPage = usePageParam("accuracyTicketPage");
  const updateParams = useSearchParamsUpdate();
  /** A typed range can end before it starts; it is not read, and nothing from another range is shown under it. */
  const rangeValid = from <= to;
  const accuracy = useQuery({
    queryKey: [...solidtimeKeys.accuracy(connection.credentialId), { from, to, personPage: personPage.page, typePage: typePage.page, ticketPage: ticketPage.page }],
    queryFn: () => getAccuracy(connection.credentialId, { from, to, personPage: personPage.page, typePage: typePage.page, ticketPage: ticketPage.page }),
    enabled: rangeValid,
    placeholderData: keepPreviousData,
    retry: retryUnlessClientError,
  });
  const served = accuracy.data && !accuracy.isPlaceholderData ? accuracy.data : undefined;
  useSyncServedPage(personPage, served?.byPerson.page);
  useSyncServedPage(typePage, served?.byType.page);
  useSyncServedPage(ticketPage, served?.byTicket.page);
  const resetPages = () => updateParams({ personPage: null, typePage: null, accuracyTicketPage: null }, { replace: true });
  const setRange = (nextFrom: string, nextTo: string) => {
    setFrom(nextFrom);
    setTo(nextTo);
    resetPages();
  };
  const scope = connection.canViewTeam ? "your team's" : "your";

  async function download() {
    setDownloadError(null);
    setDownloading(true);

    try {
      const blob = await apiDownload(weeklyCsvUrl(connection.credentialId, week));
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `time-${week}.csv`;
      link.click();
      // Released after the browser has started the download.
      window.setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
    } catch (error) {
      setDownloadError(error instanceof ApiError ? error.message : "The export could not be downloaded.");
    } finally {
      setDownloading(false);
    }
  }

  const data = accuracy.data;

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="accuracy-title" className="flex flex-col gap-4">
        <Card className="flex flex-col gap-3 p-4">
          <div>
            <h3 id="accuracy-title" className="text-base font-semibold text-slate-950">
              Estimate accuracy
            </h3>
            <p className="mt-0.5 text-sm text-slate-600">
              How {scope} time tracked in Solidtime compares with each ticket's Original Estimate in Azure DevOps. Only tickets with an estimate and time in the period count.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
            {PRESETS.map((preset) => {
              const presetFrom = shiftDay(today, -(preset.days - 1));
              const active = from === presetFrom && to === today;
              return (
                <Button key={preset.days} size="sm" variant={active ? "primary" : "secondary"} aria-pressed={active} onClick={() => setRange(presetFrom, today)}>
                  {preset.label}
                </Button>
              );
            })}
            <span className="mx-1 hidden h-6 w-px bg-slate-200 sm:block" aria-hidden="true" />
            <label className="flex items-center gap-2">
              From
              <DatePicker aria-label="From" size="sm" value={from} max={to} onChange={(picked) => picked && setRange(picked, to)} />
            </label>
            <label className="flex items-center gap-2">
              To
              <DatePicker aria-label="To" size="sm" value={to} min={from} max={today} onChange={(picked) => picked && setRange(from, picked)} />
            </label>
            {accuracy.isFetching ? <Spinner className="size-4 text-indigo-600" /> : null}
          </div>
        </Card>

        {rangeValid && accuracy.error && data ? <StaleDataBanner error={accuracy.error} onRetry={() => void accuracy.refetch()} isRetrying={accuracy.isFetching} /> : null}

        {!rangeValid ? (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            The start date ({formatDayLabel(from, { day: "numeric", month: "short", year: "numeric" })}) is after the end date ({formatDayLabel(to, { day: "numeric", month: "short", year: "numeric" })}). Choose a start on or before the end.
          </p>
        ) : accuracy.isLoading ? (
          <SkeletonRows rows={3} />
        ) : !data ? (
          <ErrorCard error={accuracy.error} onRetry={() => void accuracy.refetch()} isRetrying={accuracy.isFetching} />
        ) : data.totals.tickets === 0 ? (
          <EmptyState>
            No tracked tickets with an Azure estimate between {formatDayLabel(from, { day: "numeric", month: "short" })} and {formatDayLabel(to, { day: "numeric", month: "short" })}.
            {data.ticketsWithoutEstimate ? ` ${data.ticketsWithoutEstimate} ticket(s) had time but no estimate.` : ""}
          </EmptyState>
        ) : (
          <Updating active={accuracy.isPlaceholderData} className="flex flex-col gap-4">
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatTile label="Tickets compared" value={data.totals.tickets} hint={data.ticketsWithoutEstimate ? `${data.ticketsWithoutEstimate} more had no estimate` : undefined} />
                <StatTile label="Tracked" value={formatHours(data.totals.trackedHours)} hint={`estimated ${formatHours(data.totals.estimateHours)}`} />
                <StatTile
                  label="Of estimate"
                  value={<span className={cn(data.totals.ratio !== null && data.totals.ratio > OVER_WARNING ? "text-rose-700" : data.totals.ratio !== null && data.totals.ratio > 1 ? "text-amber-700" : "text-emerald-700")}>{percentOf(data.totals.ratio)}</span>}
                  hint="100% = exactly on estimate"
                />
                <StatTile label="Went over" value={`${data.totals.overEstimate} of ${data.totals.tickets}`} hint="tickets past their estimate" />
              </div>

              <section className="flex flex-col gap-2" aria-label="Tickets">
                <h4 className="text-sm font-semibold text-slate-900">Tickets, furthest over first</h4>
                <TicketTable page={data.byTicket} azureCredentialId={connection.azureCredentialId} onPage={(next) => ticketPage.setPage(next)} busy={accuracy.isFetching} />
              </section>

              {/* Groupings only help when there is more than one group. */}
              {data.team && data.byPerson.total > 1 ? <GroupTable title="By person" column="Person" page={data.byPerson} onPage={(next) => personPage.setPage(next)} busy={accuracy.isFetching} /> : null}
              {data.byType.total > 1 ? <GroupTable title="By ticket type" column="Type" page={data.byType} onPage={(next) => typePage.setPage(next)} busy={accuracy.isFetching} /> : null}
            </div>
          </Updating>
        )}
      </section>

      <Card className="flex flex-col gap-3 p-4" aria-labelledby="weekly-title">
        <div>
          <h3 id="weekly-title" className="text-base font-semibold text-slate-950">
            Weekly export
          </h3>
          <p className="mt-0.5 text-sm text-slate-600">A CSV of {scope} time per person, day and ticket for one week (Monday to Sunday).</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 whitespace-nowrap text-sm text-slate-700">
            Week starting
            <DatePicker aria-label="Week starting" size="sm" value={week} max={today} onChange={(picked) => picked && setWeek(weekStart(picked))} />
          </label>
          <span className="text-sm text-slate-500">
            {formatDayLabel(week, { weekday: "short", day: "numeric", month: "short" })} – {formatDayLabel(shiftDay(week, 6), { weekday: "short", day: "numeric", month: "short" })}
          </span>
          <Button size="sm" variant="secondary" disabled={downloading} onClick={() => void download()}>
            {downloading ? <Spinner className="size-4" /> : null}
            Download CSV
          </Button>
        </div>
        {downloadError ? (
          <p role="alert" className="text-sm text-rose-600">
            {downloadError}
          </p>
        ) : null}
      </Card>
    </div>
  );
}
